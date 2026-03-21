#!/usr/bin/env node

import express from 'express';
import { makeWASocket, DisconnectReason, initAuthCreds } from 'atexovi-baileys';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================
// 🔥 JSON FILE STORAGE (Firebase Alternative)
// =======================
const STORAGE_FILE = path.join(__dirname, 'sessions.json');

// Load sessions from file
function loadSessions() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.log('Error loading sessions:', err);
    }
    return {};
}

// Save sessions to file
function saveSessions(sessions) {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(sessions, null, 2));
    } catch (err) {
        console.log('Error saving sessions:', err);
    }
}

// =======================
// 🔥 AUTH STATE (JSON File Based)
// =======================
async function useFileAuthState(uid) {
    const sessions = loadSessions();
    
    if (!sessions[uid]) {
        sessions[uid] = {
            creds: initAuthCreds(),
            keys: {},
            number: null,
            createdAt: Date.now()
        };
        saveSessions(sessions);
    }
    
    const userSession = sessions[uid];
    
    return {
        state: {
            creds: userSession.creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        let value = userSession.keys[key];
                        if (value && type === 'app-state-sync-key') {
                            try {
                                value = Buffer.from(value, 'base64');
                            } catch (e) {
                                value = Buffer.from(value);
                            }
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const type in data) {
                        for (const id in data[type]) {
                            let value = data[type][id];
                            if (value instanceof Buffer) {
                                value = value.toString('base64');
                            }
                            if (value) {
                                userSession.keys[`${type}-${id}`] = value;
                            } else {
                                delete userSession.keys[`${type}-${id}`];
                            }
                        }
                    }
                    saveSessions(sessions);
                }
            }
        },
        saveCreds: async (newCreds) => {
            userSession.creds = newCreds;
            saveSessions(sessions);
        }
    };
}

// =======================
// 🔥 EXPRESS
// =======================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =======================
// 🔥 MEMORY SESSION
// =======================
const activeSessions = {};

// =======================
// 🔥 CREATE BOT
// =======================
async function createBot(uid) {
    if (activeSessions[uid]) return activeSessions[uid];

    const { state, saveCreds } = await useFileAuthState(uid);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['MAINUL-X BOT', 'Chrome', '120.0.0.0']
    });

    wrapSendMessageGlobally(sock);

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        console.log(chalk.blue(`💾 Creds saved for ${uid}`));
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
                setTimeout(() => {
                    delete activeSessions[uid];
                    createBot(uid);
                }, 3000);
            } else {
                console.log(chalk.red(`❌ ${uid} logged out`));
                delete activeSessions[uid];
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

    activeSessions[uid] = sock;
    return sock;
}

// =======================
// 🔥 RESTORE SESSIONS
// =======================
async function restoreSessions() {
    const sessions = loadSessions();
    const users = Object.keys(sessions);
    console.log(chalk.cyan(`♻️ Restoring ${users.length} sessions...`));
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
    const total = Object.keys(activeSessions).length;
    const connected = Object.values(activeSessions).filter(s => s.user?.id).length;
    const sessions = loadSessions();
    const totalUsers = Object.keys(sessions).length;
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>MAINUL-X BOT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: linear-gradient(135deg, #0f0c29 0%, #1a1a2e 50%, #16213e 100%);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            }
            .card {
                background: rgba(255,255,255,0.1);
                backdrop-filter: blur(10px);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                border: 1px solid rgba(255,255,255,0.2);
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                max-width: 500px;
                width: 90%;
            }
            h1 {
                background: linear-gradient(135deg, #fff, #00d4ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-size: 28px;
                margin-bottom: 20px;
            }
            .status {
                color: #00ff88;
                font-size: 18px;
                margin: 20px 0;
            }
            .stats {
                display: flex;
                justify-content: space-around;
                margin: 30px 0;
            }
            .stat {
                text-align: center;
            }
            .stat-value {
                font-size: 32px;
                font-weight: bold;
                color: #00d4ff;
            }
            .stat-label {
                font-size: 12px;
                color: rgba(255,255,255,0.6);
            }
            .footer {
                margin-top: 30px;
                font-size: 12px;
                color: rgba(255,255,255,0.4);
            }
            .badge {
                display: inline-block;
                background: rgba(0,212,255,0.2);
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 12px;
                margin: 5px;
            }
            hr {
                border-color: rgba(255,255,255,0.1);
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🤖 MAINUL-X BOT</h1>
            <div class="status">● ONLINE</div>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${totalUsers}</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${connected}</div>
                    <div class="stat-label">Connected</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Active Sessions</div>
                </div>
            </div>
            
            <div>
                <span class="badge">📱 WhatsApp Bot</span>
                <span class="badge">🎬 YouTube</span>
                <span class="badge">📘 Facebook</span>
                <span class="badge">📸 Instagram</span>
                <span class="badge">🎵 TikTok</span>
            </div>
            
            <hr>
            
            <p style="font-size: 14px; margin: 15px 0;">
                🔥 <strong>MAINUL - X DOWNLOADER</strong><br>
                Download videos from any platform
            </p>
            
            <div class="footer">
                <p>© 2026 MAINUL - X | All Rights Reserved</p>
                <p style="font-size: 10px;">📱 Pair via API: POST /pair</p>
            </div>
        </div>
    </body>
    </html>
    `);
});

// =======================
// ❤️ HEALTH
// =======================
app.get('/health', (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});

// =======================
// 🔥 PAIR API
// =======================
app.post('/pair', async (req, res) => {
    try {
        let { uid, number } = req.body;

        if (!uid || !number) {
            return res.json({ success: false, msg: "Missing uid/number" });
        }

        const cleanNumber = number.replace(/[^0-9]/g, '');
        
        // Check if number already exists
        const sessions = loadSessions();
        let alreadyConnected = false;
        let existingUid = null;
        
        for (const [key, session] of Object.entries(sessions)) {
            if (session.number === cleanNumber) {
                alreadyConnected = true;
                existingUid = key;
                break;
            }
        }
        
        if (alreadyConnected) {
            return res.json({
                success: false,
                msg: `This number is already connected with UID: ${existingUid} ❌`
            });
        }

        let sock = activeSessions[uid];
        if (!sock) {
            sock = await createBot(uid);
        }

        // Wait for socket to be ready
        await new Promise(r => setTimeout(r, 2000));

        // Request pairing code
        const code = await sock.requestPairingCode(cleanNumber);
        console.log(chalk.green(`📱 Pairing code for ${cleanNumber}: ${code}`));

        // Save number to session
        const allSessions = loadSessions();
        if (!allSessions[uid]) {
            allSessions[uid] = {
                creds: allSessions[uid]?.creds || initAuthCreds(),
                keys: allSessions[uid]?.keys || {},
                number: cleanNumber,
                createdAt: Date.now()
            };
        } else {
            allSessions[uid].number = cleanNumber;
        }
        saveSessions(allSessions);

        return res.json({
            success: true,
            code: code,
            msg: `Pairing code sent to ${cleanNumber}`
        });

    } catch (err) {
        console.log("PAIR ERROR:", err);
        return res.json({ success: false, msg: err.message });
    }
});

// =======================
// 🔥 STATUS API
// =======================
app.post('/status', (req, res) => {
    const { uid } = req.body;
    if (!activeSessions[uid]) {
        return res.json({ connected: false });
    }
    return res.json({
        connected: !!activeSessions[uid].user?.id,
        uid: uid
    });
});

// =======================
// 🔥 LIST ALL SESSIONS
// =======================
app.get('/sessions', (req, res) => {
    const sessions = loadSessions();
    const data = {};
    for (const [uid, session] of Object.entries(sessions)) {
        data[uid] = {
            number: session.number,
            connected: !!activeSessions[uid]?.user?.id,
            createdAt: session.createdAt
        };
    }
    res.json(data);
});

// =======================
// 🔥 DELETE SESSION
// =======================
app.delete('/session/:uid', (req, res) => {
    const { uid } = req.params;
    const sessions = loadSessions();
    
    if (sessions[uid]) {
        delete sessions[uid];
        saveSessions(sessions);
        
        if (activeSessions[uid]) {
            activeSessions[uid].end();
            delete activeSessions[uid];
        }
        
        res.json({ success: true, msg: `Session ${uid} deleted` });
    } else {
        res.json({ success: false, msg: "Session not found" });
    }
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, async () => {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════╗
║  🔥 MAINUL-X WHATSAPP BOT 🔥                     ║
║  📡 Server: http://localhost:${PORT}               ║
║  📱 Pair API: POST /pair                        ║
║  📊 Status: GET /health                         ║
║  👤 Sessions: GET /sessions                     ║
║  ❌ Delete: DELETE /session/:uid                 ║
╚══════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.green(`\n✅ JSON File Storage Ready`));
    console.log(chalk.yellow(`📁 Sessions saved to: ${STORAGE_FILE}\n`));
    
    await restoreSessions();
    console.log(chalk.cyan(`\n🤖 Bot is ready!\n`));
});
