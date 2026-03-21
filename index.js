#!/usr/bin/env node

import express from 'express';
import { makeWASocket, useMultiFileAuthState } from 'atexovi-baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

// =======================
// 🔥 EXPRESS SERVER
// =======================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =======================
// 🔥 SESSION STORE
// =======================
const sessions = {}; // number ভিত্তিক

// =======================
// 🔥 CREATE BOT
// =======================
async function createBot(number) {

    const authDir = path.join(process.cwd(), 'sessions', number);

    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sessions[number] = sock;

    return sock;
}

// =======================
// 🔥 ROOT
// =======================
app.get('/', (req, res) => {
    res.send("🚀 MAINUL-X PAIR API RUNNING (NUMBER BASED)");
});

// =======================
// 🔥 PAIR API
// =======================
app.post('/pair', async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.json({
                success: false,
                msg: "Missing number"
            });
        }

        let sock = sessions[number];

        if (!sock) {
            sock = await createBot(number);
        }

        // 🔥 already connected check
        if (sock.user) {
            return res.json({
                success: false,
                msg: "This number is already connected"
            });
        }

        // 🔥 small delay (important)
        await new Promise(r => setTimeout(r, 1000));

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
    console.log(`🚀 Server running on port ${PORT}`);
});
