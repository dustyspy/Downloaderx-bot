#!/usr/bin/env node

import express from 'express';
import { makeWASocket, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import path from 'path';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

// =======================
// 🔥 LOG FILTER (তোমার আগের কোড থেকে)
// =======================
const originalError = console.error;
const originalLog = console.log;
const FILTER_PATTERNS = [
  'Bad MAC', 'Failed to decrypt', 'Session error:', 'Closing open session', 
  'SessionEntry', 'pubKey:', 'privKey:', 'messageKeys:'
];

console.error = function(...args) {
  const msg = args.join(' ');
  if (FILTER_PATTERNS.some(p => msg.includes(p))) return;
  originalError.apply(console, args);
};

console.log = function(...args) {
  const msg = args.join(' ');
  if (FILTER_PATTERNS.some(p => msg.includes(p))) return;
  originalLog.apply(console, args);
};

// =======================
// 🔥 FIREBASE INIT
// =======================
const serviceAccountRaw = process.env.SERVICE_ACCOUNT_KEY;
if (!serviceAccountRaw) {
    console.error(chalk.red("❌ SERVICE_ACCOUNT_KEY is missing in ENV"));
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://downloaderx-wa-code-default-rtdb.firebaseio.com" // তোমার ডাটাবেস ইউআরএল
});
const db = admin.database();

// =======================
// 🔥 EXPRESS SERVER SETUP
// =======================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const sessions = {};

// =======================
// 🔥 FIREBASE AUTH STATE
// =======================
async function useFirebaseAuthState(uid) {
    const ref = db.ref(`sessions/${uid}`);
    let credsSnap = await ref.child('creds').get();
    let creds = credsSnap.val() || {};

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let snap = await ref.child(`keys/${type}-${id}`).get();
                        let value = snap.val();
                        if (value && type === 'app-state-sync-key') value = Buffer.from(value, 'base64');
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const type in data) {
                        for (const id in data[type]) {
                            let value = data[type][id];
                            if (value instanceof Buffer) value = value.toString('base64');
                            if (value) await ref.child(`keys/${type}-${id}`).set(value);
                            else await ref.child(`keys/${type}-${id}`).remove();
                        }
                    }
                }
            }
        },
        saveCreds: async () => { await ref.child('creds').set(creds); }
    };
}

// =======================
// 🔥 CREATE BOT
// =======================
async function createBot(uid) {
    if (sessions[uid]) return sessions[uid];

    const { state, saveCreds } = await useFirebaseAuthState(uid);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    wrapSendMessageGlobally(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(chalk.greenBright(`✅ ${uid} Terhubung ke WhatsApp!`));
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`🔁 Koneksi terputus, reconnecting ${uid}...`));
                delete sessions[uid];
                createBot(uid);
            } else {
                console.log(chalk.red(`❌ Session ${uid} logged out.`));
                delete sessions[uid];
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages?.[0];
        if (!msg || msg.key.fromMe) return;
        try { await handler(sock, msg); } catch (err) { console.error('[Handler Error]', err); }
    });

    sessions[uid] = sock;
    return sock;
}

// =======================
// 🔥 WEB DASHBOARD (UI)
// =======================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DownloaderX Web</title>
        <style>
            body { background: linear-gradient(135deg,#0f0c29,#302b63,#24243e); color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; margin: 0; }
            .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); padding: 40px; border-radius: 20px; display: inline-block; box-shadow: 0 0 30px rgba(0,212,255,0.2); max-width: 400px; width: 100%; }
            h1 { color: #00d4ff; margin-bottom: 10px; }
            input { padding: 15px; border-radius: 10px; border: none; width: 90%; margin: 15px 0; background: rgba(255,255,255,0.1); color: white; font-size: 16px; outline: none; }
            input::placeholder { color: #aaa; }
            button { padding: 15px 30px; background: #00d4ff; color: black; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.3s; width: 100%; }
            button:hover { background: #00aacc; box-shadow: 0 0 15px #00d4ff; }
            #code-box { font-size: 28px; color: #00ff88; margin-top: 25px; font-weight: bold; letter-spacing: 2px; }
            .features { margin-top: 20px; font-size: 14px; color: #ccc; text-align: left; line-height: 1.8; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>📥 DownloaderX</h1>
            <p>Connect your WhatsApp</p>
            
            <input type="text" id="num" placeholder="E.g. 8801308850528">
            <button onclick="getCode()" id="btn">Get Pairing Code</button>
            
            <div id="code-box"></div>

            <div class="features">
                <hr style="border-color: #333; margin: 20px 0;">
                ▷ YouTube Downloader <br>
                ⓕ Facebook Downloader <br>
                🅾 Instagram Downloader <br>
                【ꚠ】 TikTok Downloader
            </div>
        </div>

        <script>
            async function getCode() {
                const num = document.getElementById('num').value;
                const btn = document.getElementById('btn');
                const codeBox = document.getElementById('code-box');

                if(!num) { alert("Please enter a number!"); return; }

                btn.innerText = '⏳ Requesting...';
                btn.disabled = true;
                codeBox.innerText = '';
                
                try {
                    const res = await fetch('/pair', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ uid: 'user_' + num, number: num })
                    });
                    const data = await res.json();
                    
                    if(data.success) {
                        codeBox.innerText = data.code;
                    } else {
                        alert("Error: " + data.msg);
                    }
                } catch(e) {
                    alert("Network error!");
                }
                
                btn.innerText = 'Get Pairing Code';
                btn.disabled = false;
            }
        </script>
    </body>
    </html>
    `);
});

// =======================
// 🔥 PAIR API
// =======================
app.post('/pair', async (req, res) => {
    try {
        let { uid, number } = req.body;
        if (!uid || !number) return res.json({ success: false, msg: "Missing Data" });

        const cleanNumber = number.replace(/[^0-9]/g, '');

        const sock = await createBot(uid);
        if (sock.user) return res.json({ success: false, msg: "Already connected" });

        await new Promise(r => setTimeout(r, 2000));
        const code = await sock.requestPairingCode(cleanNumber);
        
        // Save number to DB
        await db.ref(`sessions/${uid}/number`).set(cleanNumber);

        res.json({ success: true, code });
    } catch (err) {
        res.json({ success: false, msg: err.message });
    }
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, () => {
    console.log(chalk.cyanBright(`\n🚀 DownloaderX Web running on port ${PORT}`));
    console.log(chalk.greenBright(`🌐 Open: http://localhost:${PORT}\n`));
});
