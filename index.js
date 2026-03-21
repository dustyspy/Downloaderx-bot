#!/usr/bin/env node

import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================
// 🔥 EXPRESS SERVER
// =======================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// =======================
// 🔥 SESSIONS STORAGE
// =======================
const sessions = {};
const authDir = path.join(__dirname, 'sessions');

// Ensure auth directory exists
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

// =======================
// 🔥 FILTER PATTERNS (Clean logs)
// =======================
const FILTER_PATTERNS = [
    'Bad MAC', 'Failed to decrypt message with any known session',
    'Session error:', 'Failed to decrypt', 'Closing open session',
    'Closing session:', 'SessionEntry', '_chains:', 'registrationId:',
    'currentRatchet:', 'indexInfo:', '<Buffer', 'pubKey:', 'privKey:',
    'baseKey:', 'remoteIdentityKey:', 'lastRemoteEphemeralKey:',
    'ephemeralKeyPair:', 'chainKey:', 'chainType:', 'messageKeys:'
];

// =======================
// 🔥 CREATE BOT
// =======================
async function createBot(uid) {
    if (sessions[uid]) return sessions[uid];

    const userAuthDir = path.join(authDir, uid);
    if (!fs.existsSync(userAuthDir)) {
        fs.mkdirSync(userAuthDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(userAuthDir);

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
                    delete sessions[uid];
                    createBot(uid);
                }, 3000);
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
// 🔥 RESTORE ALL SESSIONS
// =======================
async function restoreSessions() {
    if (!fs.existsSync(authDir)) return;
    
    const dirs = fs.readdirSync(authDir);
    console.log(chalk.cyan(`♻️ Restoring ${dirs.length} sessions...`));
    
    for (const uid of dirs) {
        try {
            await createBot(uid);
        } catch (err) {
            console.log(`Restore failed for ${uid}`, err);
        }
    }
}

// =======================
// 🔥 WEB INTERFACE
// =======================
app.get('/', (req, res) => {
    const total = Object.keys(sessions).length;
    const connected = Object.values(sessions).filter(s => s.user?.id).length;
    
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
                padding: 20px;
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
                width: 100%;
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
            .stat-value {
                font-size: 32px;
                font-weight: bold;
                color: #00d4ff;
            }
            .stat-label {
                font-size: 12px;
                color: rgba(255,255,255,0.6);
            }
            .input-group {
                margin: 20px 0;
                text-align: left;
            }
            .input-group label {
                display: block;
                margin-bottom: 8px;
                color: #00d4ff;
                font-size: 14px;
            }
            .input-group input {
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 12px;
                color: white;
                font-size: 14px;
            }
            .input-group input:focus {
                outline: none;
                border-color: #00d4ff;
            }
            button {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #00d4ff, #0099cc);
                border: none;
                border-radius: 12px;
                color: #0f0c29;
                font-weight: bold;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s;
            }
            button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 20px rgba(0,212,255,0.3);
            }
            .code-box {
                background: rgba(0,0,0,0.5);
                padding: 15px;
                border-radius: 12px;
                margin: 15px 0;
                font-size: 24px;
                font-weight: bold;
                letter-spacing: 4px;
                color: #00ff88;
                display: none;
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
            .message {
                padding: 10px;
                border-radius: 8px;
                margin: 10px 0;
                display: none;
            }
            .message.success {
                background: rgba(0,255,136,0.2);
                border: 1px solid #00ff88;
                color: #00ff88;
            }
            .message.error {
                background: rgba(255,68,68,0.2);
                border: 1px solid #ff4444;
                color: #ff4444;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🤖 MAINUL-X BOT</h1>
            <div class="status">● ONLINE</div>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value" id="totalUsers">0</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="connected">0</div>
                    <div class="stat-label">Connected</div>
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
            
            <div class="input-group">
                <label>👤 User ID</label>
                <input type="text" id="uid" placeholder="Enter your UID (e.g., mainul)" value="mainul">
            </div>
            
            <div class="input-group">
                <label>📱 WhatsApp Number</label>
                <input type="tel" id="number" placeholder="Enter WhatsApp number (e.g., 8801308850528)">
            </div>
            
            <button onclick="pairBot()">🔗 PAIR DEVICE</button>
            
            <div id="codeBox" class="code-box"></div>
            <div id="messageBox" class="message"></div>
            
            <hr>
            
            <div class="footer">
                <p>© 2026 MAINUL - X | All Rights Reserved</p>
                <p style="font-size: 10px;">📱 Open WhatsApp > Linked Devices > Link with phone number</p>
            </div>
        </div>
        
        <script>
            async function pairBot() {
                const uid = document.getElementById('uid').value.trim();
                const number = document.getElementById('number').value.trim();
                const codeBox = document.getElementById('codeBox');
                const messageBox = document.getElementById('messageBox');
                
                if (!uid || !number) {
                    showMessage('Please enter both UID and WhatsApp number!', 'error');
                    return;
                }
                
                codeBox.style.display = 'none';
                messageBox.style.display = 'none';
                
                showMessage('⏳ Requesting pairing code...', 'success');
                
                try {
                    const response = await fetch('/pair', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid, number })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        codeBox.innerHTML = '📱 <strong>Pairing Code</strong><br><span style="font-size: 32px;">' + data.code + '</span>';
                        codeBox.style.display = 'block';
                        showMessage(data.msg, 'success');
                    } else {
                        showMessage(data.msg, 'error');
                    }
                } catch (err) {
                    showMessage('Server error: ' + err.message, 'error');
                }
            }
            
            function showMessage(msg, type) {
                const messageBox = document.getElementById('messageBox');
                messageBox.innerHTML = msg;
                messageBox.className = 'message ' + type;
                messageBox.style.display = 'block';
                
                setTimeout(() => {
                    messageBox.style.display = 'none';
                }, 5000);
            }
            
            async function updateStats() {
                try {
                    const response = await fetch('/stats');
                    const data = await response.json();
                    document.getElementById('totalUsers').textContent = data.totalUsers || 0;
                    document.getElementById('connected').textContent = data.connected || 0;
                } catch (err) {
                    console.log('Stats update error');
                }
            }
            
            updateStats();
            setInterval(updateStats, 5000);
        </script>
    </body>
    </html>
    `);
});

// =======================
// 🔥 STATS API
// =======================
app.get('/stats', (req, res) => {
    const totalUsers = Object.keys(sessions).length;
    const connected = Object.values(sessions).filter(s => s.user?.id).length;
    res.json({ totalUsers, connected });
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
        
        // Check if session already exists
        const userAuthDir = path.join(authDir, uid);
        const hasSession = fs.existsSync(userAuthDir) && fs.readdirSync(userAuthDir).length > 0;
        
        let sock = sessions[uid];
        if (!sock) {
            sock = await createBot(uid);
        }

        // Wait for socket to be ready
        await new Promise(r => setTimeout(r, 2000));

        // Request pairing code
        const rawCode = await sock.requestPairingCode(cleanNumber);
        console.log(chalk.green(`📱 Pairing code for ${cleanNumber}: ${rawCode}`));
        
        // Format code
        let formattedCode = rawCode.replace(/[^0-9]/g, '');
        let displayCode = formattedCode;
        
        if (formattedCode.length === 8) {
            displayCode = `${formattedCode.slice(0, 3)}-${formattedCode.slice(3, 6)}-${formattedCode.slice(6, 8)}`;
        } else if (formattedCode.length === 9) {
            displayCode = `${formattedCode.slice(0, 3)}-${formattedCode.slice(3, 6)}-${formattedCode.slice(6, 9)}`;
        }

        return res.json({
            success: true,
            code: displayCode,
            msg: `✅ Pairing code generated!\n\n📱 Open WhatsApp > Linked Devices > Link with phone number\n🔑 Enter this code: ${displayCode}\n\n⏳ Code expires in 5 minutes`
        });

    } catch (err) {
        console.log("PAIR ERROR:", err);
        return res.json({ success: false, msg: err.message });
    }
});

// =======================
// 🔥 HEALTH API
// =======================
app.get('/health', (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});

// =======================
// 🔥 SESSIONS API
// =======================
app.get('/sessions', (req, res) => {
    const data = {};
    for (const [uid, sock] of Object.entries(sessions)) {
        data[uid] = {
            connected: !!sock.user?.id,
            userId: sock.user?.id || null
        };
    }
    res.json(data);
});

// =======================
// 🔥 DELETE SESSION
// =======================
app.delete('/session/:uid', async (req, res) => {
    const { uid } = req.params;
    
    if (sessions[uid]) {
        try {
            sessions[uid].end();
        } catch (e) {}
        delete sessions[uid];
    }
    
    const userAuthDir = path.join(authDir, uid);
    if (fs.existsSync(userAuthDir)) {
        fs.rmSync(userAuthDir, { recursive: true, force: true });
    }
    
    res.json({ success: true, msg: `Session ${uid} deleted` });
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, async () => {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════╗
║  🔥 MAINUL-X WHATSAPP BOT 🔥                     ║
║  📡 Server: http://localhost:${PORT}               ║
║  🌐 Web Interface: http://localhost:${PORT}        ║
║  📱 Pair API: POST /pair                        ║
║  📊 Status: GET /health                         ║
║  👤 Sessions: GET /sessions                     ║
╚══════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.green(`\n✅ Session directory: ${authDir}`));
    await restoreSessions();
    console.log(chalk.cyan(`\n🤖 Bot is ready! Open http://localhost:${PORT} in browser\n`));
});
