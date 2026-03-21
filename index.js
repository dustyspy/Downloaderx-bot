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
    res.send('🤖 MAINUL-X MULTI BOT SERVER RUNNING ✅');
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

        console.log("PAIR REQUEST:", uid, number);

        if (!uid || !number) {
            return res.json({ success: false, msg: "Missing uid/number" });
        }

        let sock = sessions[uid];

        if (!sock) {
            sock = await createBot(uid);
        }

        // already connected check
        if (sock.user) {
            return res.json({
                success: false,
                msg: "Bot already connected"
            });
        }

        const code = await sock.requestPairingCode(number);

        console.log("PAIR CODE:", code);

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

    const sock = sessions[uid];

    return res.json({
        connected: !!sock.user
    });
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, () => {
    console.log(chalk.cyan(`🚀 MAINUL-X BOT SERVER RUNNING ON PORT ${PORT}`));
});
