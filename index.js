#!/usr/bin/env node

import express from 'express';
import { makeWASocket, DisconnectReason, initAuthCreds, useMultiFileAuthState } from 'atexovi-baileys';
import pino from 'pino';
import admin from 'firebase-admin';

// =======================
// 🔥 FIREBASE CONFIG
// =======================
const rawPrivateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXiCy7lWmMpFEo\nROWrFHQhBthAR2u6uDjJUK4rys8yvHsLK4tsbDIo0Xl0qKEkmRe7jXJ+mcuQ6Y5b\nJ+b5v8lJKah6ZGuwevw55jMyeWwvgUslUQOcNto/VGKlZYbLbtMiiu7DpZmL7Hs3\n+PExUuTIfY6co+gxnQ6XYba9KbMOsZ00f97HArNmYYxSYieGlo3AdUUNriShYJIw\nUQDaMwOmNUDUeztUgP+ihssi0w82Gbg9PC/LzBhEaaE17tF2KJPAIxXobZDCnpal\n8M/0z2NEaJ5yi0e1gj7T+m+/9zzWpKYTYPJztTwBrC6ND89t40WOOjwnQoGCEbVL\n0sIbTeuRAgMBAAECggEAELQN+2+l4W9ulrdYMT0Bjvmv0rN2Rt82D2wAQ4aRLjZr\nNr9mK73q2Tz6s67J5kMzEqbwo50ZqJ5hGPFrthlF6TSgSPP1YJT3bSlI+HVui/Py\nNe8kX3vkyBmrF3RZ0PRCyp+Hx4PS9YQbPIg/cPoinuMUJVGSkh3A3ryE4/4SUWYP\n+2Rowgb+dnvBusTUfhIs73mlcK9MM3VhP6Wu/q4hn4XMgw1Vd3bPAU2r4Gd0XiyG\n4GVqRDaeu9/K7rbV5o3koa4cBZ7suITLeH8Nk43r0g4wOzZ7fd4QbJGySYanUyaD\nCY9EguQGA6ULvr0FJifDj+5qeaVjzLoGooOOapsnPQKBgQD3DTm8QkoqrmJLeWPs\naOIbOhVxEqMCuOwJmv7jNgCahgZiLD8TF70+5CSbvkciFLthtebRifdAgbaDf9eg\n7uztGK7GIbrdjr+JmT0HwU9Tb6RJ4ouqv/x4UtxWda1GFIFG3PkLTd8jYXnNIXjn\nxnxF2nunQKbR9dRBWYY6BlWiPwKBgQDfVq8eNk4oX5P70Y44jOl4vf2YfNiVWDie\nTk4zzPeTB1AVgPp0ghst9nLcEl860jCRp+4OyhQAT4A32GByCIdZDdZPsF824otU\nwmGFCG4zNzRp3O3I/oRMi8wMhuCG7C7av4nr+oM8yCnxiPyTHkIrA6KjNlp9yycO\nNGs7G35eLwKBgQDcZX4WRwUnYn7qWhcctszQAVdTko6+RP696vps9KZBNEPJnTN/\n8vOvgZRvJKcM7nXkS4Tpdi2P7KhIU+qn9b6EHjr9IuYz9b9GH+DkZD5CbxyflW2I\nHNI8/Z73uu+jz3MtJsE+pm/kfndM2wmjq9z97FXX9cNdF/QNgLJQXYpTvQKBgGnw\nZWrQWayfAcQud+btOIYUoSlm9xmIWnsFK+U4catliaBZqPQBD0FzKLKpaFCviWhe\nHvcW9fvbujdDRSRyVTlx7dmpENEpDuxqs/V1tUhIBG2+5XA1Aq6IlYbPp8t4VxVe\nS98K2pvHWtX+o8hpTvu2YrxGuQ/4gJMlXEQSW5PzAoGBAIgaujPRT5d7lPSnHra3\nF1du9tE9kBc93C0z66s3mTn7zBtQE11QZHr4EtYLZ5rN33oyA9C6hbmJGzhZCiah\n94Awm4iBkTP8JoyBVK1+kElUWNIPmsWNOdcksQXcRMeulAsiV3q90x2oh6m+m6Eb\nDFEvlPMJffOsFdgpYzw0LEwU\n-----END PRIVATE KEY-----`.replace(/\\n/g, '\n');

const serviceAccount = {
  type: "service_account",
  project_id: "downloaderx-wa-code",
  private_key: rawPrivateKey,
  client_email: "firebase-adminsdk-fbsvc@downloaderx-wa-code.iam.gserviceaccount.com"
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://downloaderx-wa-code-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// =======================
// 🔥 UTILS
// =======================
const cleanData = (data) => JSON.parse(JSON.stringify(data || {}));

// =======================
// 🔥 FIREBASE AUTH STATE (FIXED)
// =======================
async function useFirebaseAuthState(sessionId) {
    const ref = db.ref(`sessions/${sessionId}`);

    let credsSnap = await ref.child('creds').get();
    let creds = credsSnap.val() || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let snap = await ref.child(`keys/${type}-${id}`).get();
                        let value = snap.val();
                        if (value && (type === 'app-state-sync-key' || type.includes('session'))) {
                            value = Buffer.from(value, 'base64');
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const updates = {};
                    for (const type in data) {
                        for (const id in data[type]) {
                            let value = data[type][id];
                            const path = `keys/${type}-${id}`;
                            if (value) {
                                updates[path] = cleanData(value instanceof Buffer ? value.toString('base64') : value);
                            } else {
                                await ref.child(path).remove();
                            }
                        }
                    }
                    await ref.update(updates);
                }
            }
        },
        saveCreds: async () => {
            await ref.child('creds').set(cleanData(creds));
        }
    };
}

// =======================
// 🔥 BOT LOGIC
// =======================
const sessions = {};

async function createBot(sessionId) {
    if (sessions[sessionId]) return sessions[sessionId];

    const { state, saveCreds } = await useFirebaseAuthState(sessionId);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log(`✅ Connected: ${sessionId}`);
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                delete sessions[sessionId];
                setTimeout(() => createBot(sessionId), 5000);
            } else {
                await db.ref(`sessions/${sessionId}`).remove();
                delete sessions[sessionId];
            }
        }
    });

    sessions[sessionId] = sock;
    return sock;
}

// =======================
// 🔥 EXPRESS ROUTES
// =======================
const app = express();
app.use(express.json());

app.post('/pair', async (req, res) => {
    try {
        let { uid, number } = req.body;
        if (!uid || !number) return res.json({ success: false, msg: "Missing info" });

        const cleanNumber = number.replace(/[^0-9]/g, '');
        const sessionId = `${uid}_${cleanNumber}`;

        if (sessions[sessionId]) delete sessions[sessionId];
        
        const sock = await createBot(sessionId);

        // সকেট স্ট্যাবল হওয়ার জন্য লুপ
        let attempt = 0;
        while (!sock.requestPairingCode && attempt < 10) {
            await new Promise(r => setTimeout(r, 1000));
            attempt++;
        }

        const code = await sock.requestPairingCode(cleanNumber);
        res.json({ success: true, code });

    } catch (err) {
        res.json({ success: false, msg: err.message });
    }
});

app.get('/', (req, res) => res.send("MAINUL-X SERVER RUNNING"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));
