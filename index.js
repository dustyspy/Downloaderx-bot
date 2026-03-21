#!/usr/bin/env node

import express from 'express';
import { makeWASocket, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

// =======================
// 🔥 FIREBASE INIT
// =======================
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://downloaderx-wa-code-default-rtdb.firebaseio.com"
});

const db = admin.database();

// =======================
// 🔥 EXPRESS
// =======================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =======================
// 🔥 MEMORY SESSION
// =======================
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

                        // 🔥 Buffer FIX
                        if (value && type === 'app-state-sync-key') {
                            value = Buffer.from(value, 'base64');
                        }

                        data[id] = value;
                    }

                    return data;
                },

                set: async (data) => {
                    for (const type in data) {
                        for (const id in data[type]) {

                            let value = data[type][id];

                            // 🔥 Buffer → base64
                            if (value instanceof Buffer) {
                                value = value.toString('base64');
                            }

                            if (value) {
                                await ref.child(`keys/${type}-${id}`).set(value);
                            } else {
                                await ref.child(`keys/${type}-${id}`).remove();
                            }
                        }
                    }
                }
            }
        },

        saveCreds: async () => {
            await ref.child('creds').set(creds);
        }
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

    // 🔥 SAFE SAVE
    sock.ev.on('creds.update', async () => {
        await saveCreds();
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(chalk.green(`✅ ${uid} connected`));
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`🔁 Reconnecting ${uid}...`));
                delete sessions[uid];
                createBot(uid);
            } else {
                console.log(chalk.red(`❌ ${uid} logged out`));
                delete sessions[uid];
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages?.[0];
        if (!msg || msg.key.fromMe) return;

        try {
            await handler(sock, msg);
        } catch (err) {
            console.log("Handler error:", err);
        }
    });

    sessions[uid] = sock;

    return sock;
}

// =======================
// 🔥 RESTORE SESSIONS
// =======================
async function restoreSessions() {

    const snap = await db.ref("sessions").get();

    if (!snap.exists()) return;

    const users = Object.keys(snap.val());

    console.log(`♻️ Restoring ${users.length} sessions...`);

    for (const uid of users) {
        try {
            await createBot(uid);
        } catch (err) {
            console.log(`Restore failed for ${uid}`, err);
        }
    }
}

// =======================
// 🔥 ROOT
// =======================
app.get('/', (req, res) => {

    const total = Object.keys(sessions).length;
    const connected = Object.values(sessions).filter(s => s.user).length;

    res.send(`
    <html>
    <body style="background:#0f0c29;color:white;text-align:center;padding:40px;">
        <h1>🤖 MAINUL-X BOT</h1>
        <p style="color:#00ff88;">● RUNNING</p>

        <p>👥 Users: ${total}</p>
        <p>🤖 Connected: ${connected}</p>

        <hr>

        <p>🔥 Firebase Session Active</p>
        <p>👨‍💻 MAINUL - X</p>
    </body>
    </html>
    `);
});

// =======================
// ❤️ HEALTH
// =======================
app.get('/health', (req, res) => {
    res.json({ status: "ok" });
});

// =======================
// 🔥 PAIR API
// =======================
app.post('/pair', async (req, res) => {
    try {
        const { uid, number } = req.body;

        if (!uid || !number) {
            return res.json({ success: false, msg: "Missing uid/number" });
        }

        let sock = sessions[uid];

        if (!sock) {
            sock = await createBot(uid);
        }

        if (sock.user) {
            return res.json({ success: false, msg: "Already connected" });
        }

        await new Promise(r => setTimeout(r, 500));

        const code = await sock.requestPairingCode(number);

        return res.json({
            success: true,
            code: code
        });

    } catch (err) {
        console.log("PAIR ERROR:", err);

        return res.json({
            success: false,
            msg: err.message
        });
    }
});

// =======================
// 🔥 STATUS API
// =======================
app.post('/status', (req, res) => {
    const { uid } = req.body;

    if (!sessions[uid]) {
        return res.json({ connected: false });
    }

    return res.json({
        connected: !!sessions[uid].user
    });
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, async () => {
    console.log(chalk.cyan(`🚀 MAINUL-X SERVER RUNNING ON ${PORT}`));

    await restoreSessions(); // 🔥 AUTO LOAD
});
