#!/usr/bin/env node
process.on('uncaughtException', (err) => {
    console.log('💥 UNCAUGHT ERROR:', err);
});

process.on('unhandledRejection', (err) => {
    console.log('💥 PROMISE ERROR:', err);
});
import express from 'express';
import { makeWASocket, DisconnectReason, initAuthCreds } from 'atexovi-baileys';
import pino from 'pino';
import admin from 'firebase-admin';

// =======================
// 🔥 FIREBASE CONFIG
// =======================
const serviceAccount = {
  type: "service_account",
  project_id: "downloaderx-wa-code",
  private_key: `-----BEGIN PRIVATE KEY-----MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXiCy7lWmMpFEo\nROWrFHQhBthAR2u6uDjJUK4rys8yvHsLK4tsbDIo0Xl0qKEkmRe7jXJ+mcuQ6Y5b\nJ+b5v8lJKah6ZGuwevw55jMyeWwvgUslUQOcNto/VGKlZYbLbtMiiu7DpZmL7Hs3\n+PExUuTIfY6co+gxnQ6XYba9KbMOsZ00f97HArNmYYxSYieGlo3AdUUNriShYJIw\nUQDaMwOmNUDUeztUgP+ihssi0w82Gbg9PC/LzBhEaaE17tF2KJPAIxXobZDCnpal\n8M/0z2NEaJ5yi0e1gj7T+m+/9zzWpKYTYPJztTwBrC6ND89t40WOOjwnQoGCEbVL\n0sIbTeuRAgMBAAECggEAELQN+2+l4W9ulrdYMT0Bjvmv0rN2Rt82D2wAQ4aRLjZr\nNr9mK73q2Tz6s67J5kMzEqbwo50ZqJ5hGPFrthlF6TSgSPP1YJT3bSlI+HVui/Py\nNe8kX3vkyBmrF3RZ0PRCyp+Hx4PS9YQbPIg/cPoinuMUJVGSkh3A3ryE4/4SUWYP\n+2Rowgb+dnvBusTUfhIs73mlcK9MM3VhP6Wu/q4hn4XMgw1Vd3bPAU2r4Gd0XiyG\n4GVqRDaeu9/K7rbV5o3koa4cBZ7suITLeH8Nk43r0g4wOzZ7fd4QbJGySYanUyaD\nCY9EguQGA6ULvr0FJifDj+5qeaVjzLoGooOOapsnPQKBgQD3DTm8QkoqrmJLeWPs\naOIbOhVxEqMCuOwJmv7jNgCahgZiLD8TF70+5CSbvkciFLthtebRifdAgbaDf9eg\n7uztGK7GIbrdjr+JmT0HwU9Tb6RJ4ouqv/x4UtxWda1GFIFG3PkLTd8jYXnNIXjn\nxnxF2nunQKbR9dRBWYY6BlWiPwKBgQDfVq8eNk4oX5P70Y44jOl4vf2YfNiVWDie\nTk4zzPeTB1AVgPp0ghst9nLcEl860jCRp+4OyhQAT4A32GByCIdZDdZPsF824otU\nwmGFCG4zNzRp3O3I/oRMi8wMhuCG7C7av4nr+oM8yCnxiPyTHkIrA6KjNlp9yycO\nNGs7G35eLwKBgQDcZX4WRwUnYn7qWhcctszQAVdTko6+RP696vps9KZBNEPJnTN/\n8vOvgZRvJKcM7nXkS4Tpdi2P7KhIU+qn9b6EHjr9IuYz9b9GH+DkZD5CbxyflW2I\nHNI8/Z73uu+jz3MtJsE+pm/kfndM2wmjq9z97FXX9cNdF/QNgLJQXYpTvQKBgGnw\nZWrQWayfAcQud+btOIYUoSlm9xmIWnsFK+U4catliaBZqPQBD0FzKLKpaFCviWhe\nHvcW9fvbujdDRSRyVTlx7dmpENEpDuxqs/V1tUhIBG2+5XA1Aq6IlYbPp8t4VxVe\nS98K2pvHWtX+o8hpTvu2YrxGuQ/4gJMlXEQSW5PzAoGBAIgaujPRT5d7lPSnHra3\nF1du9tE9kBc93C0z66s3mTn7zBtQE11QZHr4EtYLZ5rN33oyA9C6hbmJGzhZCiah\n94Awm4iBkTP8JoyBVK1+kElUWNIPmsWNOdcksQXcRMeulAsiV3q90x2oh6m+m6Eb\nDFEvlPMJffOsFdgpYzw0LEwU-----END PRIVATE KEY-----`,
  client_email: "firebase-adminsdk-fbsvc@downloaderx-wa-code.iam.gserviceaccount.com"
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
async function useFirebaseAuthState(sessionId) {

    const ref = db.ref(`sessions/${sessionId}`);

    let credsSnap = await ref.child('creds').get();
    let creds = credsSnap.val();

    if (!creds) creds = initAuthCreds();

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
async function createBot(sessionId) {

    if (sessions[sessionId]) return sessions[sessionId];

    const { state, saveCreds } = await useFirebaseAuthState(sessionId);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds(sock.authState.creds);
    });

    sock.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log(`✅ Connected: ${sessionId}`);
        }

        if (connection === 'close') {

            const reason = lastDisconnect?.error?.output?.statusCode;

            if (reason !== DisconnectReason.loggedOut) {
                console.log(`🔁 Reconnecting: ${sessionId}`);
                delete sessions[sessionId];
                createBot(sessionId);
            } else {
                console.log(`❌ Logged out: ${sessionId}`);
                delete sessions[sessionId];
                await db.ref(`sessions/${sessionId}`).remove();
            }
        }
    });

    sessions[sessionId] = sock;

    return sock;
}

// =======================
// 🔥 RESTORE SESSIONS
// =======================
async function restoreSessions() {

    const snap = await db.ref("sessions").get();

    if (!snap.exists()) return;

    const all = snap.val();

    console.log(`♻️ Restoring sessions...`);

    for (const sessionId of Object.keys(all)) {
        try {
            await createBot(sessionId);
        } catch (err) {
            console.log(`Restore failed: ${sessionId}`);
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
    <h1>🤖 MAINUL-X BOT SERVER</h1>
    <p>Sessions: ${total}</p>
    <p>Connected: ${connected}</p>
    <p>Status: RUNNING</p>
    `);
});

// =======================
// 🔥 PAIR API (FINAL)
// =======================
app.post('/pair', async (req, res) => {

    try {

        let { uid, number } = req.body;

        if (!uid || !number) {
            return res.json({ success: false, msg: "Missing uid/number" });
        }

        const cleanNumber = number.replace(/[^0-9]/g, '');
        const sessionId = `${uid}_${cleanNumber}`;

        let sock = sessions[sessionId];

        if (!sock) {
            sock = await createBot(sessionId);
        }

        if (sock.user) {
            return res.json({ success: false, msg: "Already connected" });
        }

        console.log("📱 Waiting socket ready...");

        // 🔥 IMPORTANT WAIT
        await new Promise(r => setTimeout(r, 4000));

        console.log("📱 Requesting pairing...");

        let code;

        try {
            code = await sock.requestPairingCode(cleanNumber);
        } catch (err) {
            console.log("❌ Pairing error:", err);

            return res.json({
                success: false,
                msg: "Pairing failed (socket not ready)"
            });
        }

        console.log("✅ CODE:", code);

        return res.json({
            success: true,
            code: code
        });

    } catch (err) {

        console.log("🔥 FATAL ERROR:", err);

        return res.json({
            success: false,
            msg: err.message
        });
    }
});

// =======================
// 🔥 REMOVE NUMBER
// =======================
app.post('/remove', async (req, res) => {

    const { uid, number } = req.body;

    if (!uid || !number) {
        return res.json({ success: false });
    }

    const clean = number.replace(/[^0-9]/g, '');
    const sessionId = `${uid}_${clean}`;

    delete sessions[sessionId];

    await db.ref(`sessions/${sessionId}`).remove();
    await db.ref(`numbers/${clean}`).remove();

    return res.json({ success: true });
});

// =======================
// 🔥 STATUS
// =======================
app.post('/status', (req, res) => {

    const { uid, number } = req.body;

    const sessionId = `${uid}_${number}`;

    if (!sessions[sessionId]) {
        return res.json({ connected: false });
    }

    return res.json({
        connected: !!sessions[sessionId].user
    });
});

// =======================
// 🚀 START SERVER
// =======================
app.listen(PORT, async () => {

    console.log(`🚀 SERVER RUNNING ON ${PORT}`);

    await restoreSessions();
});
