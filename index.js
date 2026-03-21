#!/usr/bin/env node

import express from 'express';
import { makeWASocket, DisconnectReason, initAuthCreds } from 'atexovi-baileys';
import pino from 'pino';
import chalk from 'chalk';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';

dotenv.config();

// =======================
// 🔥 FIREBASE DIRECT CONFIG
// =======================
const serviceAccount = {
  "type": "service_account",
  "project_id": "downloaderx-wa-code",
  "private_key_id": "acf82fecbbde1f8110f85394dc97d2179db97e7b",
  "private_key": `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCqKq1KHBVsVSf2
TYBd/tdeNQndyb5K+5paHEHvcS84OxJ/KgXiXI4h5QUHkz4fKOCeb3OQCa5bRNjc
Sn/qvWr27PGJEzNFzH8qunNhImdhnPeKEkcLPecPti6OAbtiXpW2v3lwPShDKBBK
6R4n315UljJEaMWT6QKC16U9UM2veXoGVrTvsnH0KCIbpT3p0d3mEij2vNJC4G6k
af7h/hVNelDLeAvyKYTSeJp3WMDkkcMAJtAZr9de5SuxJJSE9gzvECxTPrkjgvnU
A8hNWvG9daP/FxUAEkVpABzsgml41j7onrx7uYOy+VdlxAa6IwhC5uuUU+NYmLtD
ZfhzDzJPAgMBAAECggEAAoNSf3uDsM+0dorgIEM7sKdNh9TLYSBvFUaWjgUuDSwI
0rpET6VN71/fn6Quhizx3ZUdb/Kcpw9mDnbGhdPEnnSS/+hkg52Iq+Zd/tYQZcd4
0QqtDumb8xud0Li404k8YnBYcu5hnQBHS/vpAe4RXrlrG58vz8aLTsha0dl9eB+9
H4wJ4apYAY3Jkmu26dcwGW39dF0IsWimClwi/+q7Ce4JVQ8JnJqjpW+45gVefXT7
dd5a8OAOCUx68sSDfufgje8mC92B3OZiToGIvZ6rsvP9qyfUwImwLpeBjstXm4Ns
oGa1bbdDPu0ubr81qm27d7XI6zlFI0x9bKa8pIndTQKBgQDch6Lt5wIFCHI4Ckcy
MisyboO/q66+SxAsv/V46XKodSZPJmXypRz/miUfPnZuMnxSZgsekZQ9dly9QSpL
9mHl8WC4crZdJ5chkSmciTiEemtSMJs/jJehXiY7SmDq9g5oLlG//NDzFb+JlisW
UaounSTab+zkrricJkRT9vcb7QKBgQDFiVP0yLTrvEk2Us0u4ebI7blK00ejQi6n
/YleUxPsVvayqfRXM9quulKZZmWau2SYAlRCr5CU1U6/T7e752YjbQikJWxC1hNK
P87zyCtshhZHRpITsHbKlic141CDtPwWFF2E3qdq9bkdI2iwfiUHSlkF5fjzqxN3
HRa4S0pXqwKBgGbQLZuwaXajO2z5DbxPO2hlsbK4fd1l7YKPdAgM/lGfXF7mTf1U
ETLxUIFCg8BYdTGNNX3o7S3CcvYg3XFQys+DO06C3JaNkJ4rqTS7nMfWsxY8ZwS3
rTGkTTqzMIAaexkDD0XsvhW2e/fPNQNQy4Cz7qyQJedvtc3G4XAr4YT5AoGAbItl
ouCW6eJwqHUfYl+nnUljxAYNG1zGnnDnBvnHvNqcfNh+91v7EoA32ys1Ma0/PXgq
LOqkG+SKfP2lDI++xECpuukFcESKHQarBbI8ikmz/D5/DmqtG+0eZrIeEAFndAqE
yPpALLoRmj1WzYTDfBoSiPcxsVOUQqOtVF+q3jkCgYEAoCMdC7qULrQ/Yzr8gVP2
jcFRiqzB13eEAF5HjIC6N8gO+Zj4mCvLVSULr4WNqNxabMlHKi3nAbqk2HmNaQ1L
q2QZOrEh3qM7Z7RLwyyVI2INUNczlD9aU7gKwFglQtPPDHKrZha0xURsn8MRwRZI
UPzds2xmpfHfdHIhco2q+tQ=
-----END PRIVATE KEY-----`,
  "client_email": "firebase-adminsdk-fbsvc@downloaderx-wa-code.iam.gserviceaccount.com"
};

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
    let creds = credsSnap.val();

    if (!creds) {
        creds = initAuthCreds(); // 🔥 FIX
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};

                    for (const id of ids) {
                        let snap = await ref.child(`keys/${type}-${id}`).get();
                        let value = snap.val();

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

        saveCreds: async (newCreds) => {
            await ref.child('creds').set(newCreds);
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
