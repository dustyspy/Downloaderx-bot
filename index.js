#!/usr/bin/env node

import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

// =======================
// 🔥 EXPRESS SERVER
// =======================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =======================
// 🔥 MULTI USER STORAGE
// =======================
const sessions = {};

// =======================
// 🔥 LOG FILTER
// =======================
const originalError = console.error;
const originalLog = console.log;

const FILTER_PATTERNS = [
  'Bad MAC','Failed to decrypt','Closing session','Session error'
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
// 🔥 CREATE BOT (PER USER)
// =======================
async function createBot(uid) {

    if (sessions[uid]) return sessions[uid]; // prevent duplicate

    const authDir = path.join(process.cwd(), 'sessions', uid);

    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    wrapSendMessageGlobally(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(chalk.green(`✅ ${uid} connected`));
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;

            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow(`🔁 Reconnecting ${uid}...`));
                delete sessions[uid]; // important
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
            console.error("Handler error:", err);
        }
    });

    sessions[uid] = sock;

    return sock;
}

// =======================
// 🔥 ROOT (CHECK SERVER)
// =======================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MAINUL-X BOT</title>

        <style>
            body {
                margin: 0;
                font-family: 'Segoe UI', sans-serif;
                background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
                color: white;
                text-align: center;
                padding: 40px;
            }

            .card {
                background: rgba(255,255,255,0.05);
                backdrop-filter: blur(10px);
                padding: 30px;
                border-radius: 20px;
                box-shadow: 0 0 30px rgba(0, 212, 255, 0.2);
                display: inline-block;
                max-width: 400px;
            }

            h1 {
                color: #00d4ff;
                margin-bottom: 10px;
            }

            .status {
                color: #00ff88;
                font-weight: bold;
                margin: 10px 0;
            }

            .info {
                margin-top: 20px;
                font-size: 14px;
                color: #ccc;
            }

            .btn {
                display: inline-block;
                margin-top: 20px;
                padding: 10px 20px;
                border-radius: 10px;
                background: #00d4ff;
                color: black;
                text-decoration: none;
                font-weight: bold;
                transition: 0.3s;
            }

            .btn:hover {
                background: #00aacc;
            }

            footer {
                margin-top: 30px;
                font-size: 12px;
                color: #aaa;
            }
        </style>
    </head>
    <body>

        <div class="card">
            <h1>🤖 MAINUL - X BOT</h1>

            <p class="status">● SERVER RUNNING</p>

            <hr>

            <p>🚀 Multi User WhatsApp Bot System</p>
            <p>⚡ Powered by Node.js & Baileys</p>

            <div class="info">
                <p>👨‍💻 Developer: Md. Mainul Islam</p>
                <p>📱 WhatsApp: +8801308850528</p>
                <p>💬 Telegram: @mdmainulislaminfo</p>
                <p>🐙 GitHub: github.com/M41NUL</p>
            </div>

            <a href="/health" class="btn">Check API Status</a>

            <footer>
                © 2026 MAINUL - X | All Rights Reserved
            </footer>
        </div>

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
            return res.json({
                success: false,
                msg: "Bot already connected"
            });
        }

        // 🔥 FIX HERE
        await waitForConnection(sock);

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
// 🚀 START SERVER
// =======================
app.listen(PORT, () => {
    console.log(chalk.cyan(`🚀 MAINUL-X BOT SERVER RUNNING ON PORT ${PORT}`));
});
