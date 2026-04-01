#!/usr/bin/env node

// =======================
// 🔥 ERROR HANDLER
// =======================
process.on('uncaughtException', (err) => {
    console.log('💥 UNCAUGHT ERROR:', err.message);
});

process.on('unhandledRejection', (err) => {
    console.log('💥 PROMISE ERROR:', err.message);
});

// =======================
// 🔥 IMPORTS
// =======================
import express from 'express';
import { makeWASocket, DisconnectReason, initAuthCreds } from 'atexovi-baileys';
import pino from 'pino';
import admin from 'firebase-admin';

// =======================
// 🔥 FIREBASE CONFIG
// =======================
const rawPrivateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXiCy7lWmMpFEo\nROWrFHQhBthAR2u6uDjJUK4rys8yvHsLK4tsbDIo0Xl0qKEkmRe7jXJ+mcuQ6Y5b\nJ+b5v8lJKah6ZGuwevw55jMyeWwvgUslUQOcNto/VGKlZYbLbtMiiu7DpZmL7Hs3\n+PExUuTIfY6co+gxnQ6XYba9KbMOsZ00f97HArNmYYxSYieGlo3AdUUNriShYJIw\nUQDaMwOmNUDUeztUgP+ihssi0w82Gbg9PC/LzBhEaaE17tF2KJPAIxXobZDCnpal\n8M/0z2NEaJ5yi0e1gj7T+m+/9zzWpKYTYPJztTwBrC6ND89t40WOOjwnQoGCEbVL\n0sIbTeuRAgMBAAECggEAELQN+2+l4W9ulrdYMT0Bjvmv0rN2Rt82D2wAQ4aRLjZr\nNr9mK73q2Tz6s67J5kMzEqbwo50ZqJ5hGPFrthlF6TSgSPP1YJT3bSlI+HVui/Py\nNe8kX3vkyBmrF3RZ0PRCyp+Hx4PS9YQbPIg/cPoinuMUJVGSkh3A3ryE4/4SUWYP\n+2Rowgb+dnvBusTUfhIs73mlcK9MM3VhP6Wu/q4hn4XMgw1Vd3bPAU2r4Gd0XiyG\n4GVqRDaeu9/K7rbV5o3koa4cBZ7suITLeH8Nk43r0g4wOzZ7fd4QbJGySYanUyaD\nCY9EguQGA6ULvr0FJifDj+5qeaVjzLoGooOOapsnPQKBgQD3DTm8QkoqrmJLeWPs\naOIbOhVxEqMCuOwJmv7jNgCahgZiLD8TF70+5CSbvkciFLthtebRifdAgbaDf9eg\n7uztGK7GIbrdjr+JmT0HwU9Tb6RJ4ouqv/x4UtxWda1GFIFG3PkLTd8jYXnNIXjn\nxnxF2nunQKbR9dRBWYY6BlWiPwKBgQDfVq8eNk4oX5P70Y44jOl4vf2YfNiVWDie\nTk4zzPeTB1AVgPp0ghst9nLcEl860jCRp+4OyhQAT4A32GByCIdZDdZPsF824otU\nwmGFCG4zNzRp3O3I/oRMi8wMhuCG7C7av4nr+oM8yCnxiPyTHkIrA6KjNlp9yycO\nNGs7G35eLwKBgQDcZX4WRwUnYn7qWhcctszQAVdTko6+RP696vps9KZBNEPJnTN/\n8vOvgZRvJKcM7nXkS4Tpdi2P7KhIU+qn9b6EHjr9IuYz9b9GH+DkZD5CbxyflW2I\nHNI8/Z73uu+jz3MtJsE+pm/kfndM2wmjq9z97FXX9cNdF/QNgLJQXYpTvQKBgGnw\nZWrQWayfAcQud+btOIYUoSlm9xmIWnsFK+U4catliaBZqPQBD0FzKLKpaFCviWhe\nHvcW9fvbujdDRSRyVTlx7dmpENEpDuxqs/V1tUhIBG2+5XA1Aq6IlYbPp8t4VxVe\nS98K2pvHWtX+o8hpTvu2YrxGuQ/4gJMlXEQSW5PzAoGBAIgaujPRT5d7lPSnHra3\nF1du9tE9kBc93C0z66s3mTn7zBtQE11QZHr4EtYLZ5rN33oyA9C6hbmJGzhZCiah\n94Awm4iBkTP8JoyBVK1+kElUWNIPmsWNOdcksQXcRMeulAsiV3q90x2oh6m+m6Eb\nDFEvlPMJffOsFdgpYzw0LEwU\n-----END PRIVATE KEY-----`;

const serviceAccount = {
  type: "service_account",
  project_id: "downloaderx-wa-code",
  private_key: rawPrivateKey,
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
// 🔥 MEMORY
// =======================
const sessions = {};

const cleanData = (data) => JSON.parse(JSON.stringify(data || {}));

// =======================
// 🔥 FIREBASE AUTH STATE
// =======================
async function useFirebaseAuthState(sessionId) {
    const ref = db.ref(`sessions/${sessionId}`);

    let creds = (await ref.child('creds').get()).val();

    if (!creds) {
        creds = initAuthCreds();
        await ref.child('creds').set(cleanData(creds));
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = (await ref.child(`keys/${type}-${id}`).get()).val();
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
                                await ref.child(`keys/${type}-${id}`).set(cleanData(value));
                            } else {
                                await ref.child(`keys/${type}-${id}`).remove();
                            }
                        }
                    }
                }
            }
        },
        saveCreds: async (newCreds) => {
            await ref.child('creds').set(cleanData(newCreds));
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
        browser:['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

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
                setTimeout(() => createBot(sessionId), 4000);
            } else {
                console.log(`❌ Logged out: ${sessionId}`);
                delete sessions[sessionId];
                await db.ref(`sessions/${sessionId}`).remove().catch(()=>{});
            }
        }
    });

    sessions[sessionId] = sock;
    return sock;
}

// =======================
// 🔥 RESTORE
// =======================
async function restoreSessions() {
    try {
        const snap = await db.ref("sessions").get();
        if (!snap.exists()) return;

        for (const id of Object.keys(snap.val())) {
            await createBot(id);
        }
    } catch (e) {
        console.log("Restore Error:", e.message);
    }
}

// =======================
// 🔥 ROOT
// =======================
app.get('/', (req, res) => {
    res.send("🚀 MAINUL-X WA SERVER RUNNING");
});

// =======================
// 🔥 PAIR (FINAL FIX)
// =======================
app.post('/pair', async (req, res) => {
    try {
        let { uid, number } = req.body || {};
        if (!uid || !number) return res.json({ success: false, msg: "Missing uid/number" });

        const clean = number.replace(/[^0-9]/g, '');
        const sessionId = `${uid}_${clean}`;

        const exists = await db.ref(`numbers/${clean}`).get();
        if (exists.exists() && exists.val().uid !== uid) {
            return res.json({ success: false, msg: "Number already connected ❌" });
        }

        // Clear old session
        if (sessions[sessionId]) {
            try { sessions[sessionId].ws?.close(); } catch(e) {}
            delete sessions[sessionId];
        }
        await db.ref(`sessions/${sessionId}`).remove();

        const { state, saveCreds } = await useFirebaseAuthState(sessionId);

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sessions[sessionId] = sock;

        // ✅ Wait for connection OPEN then get code
        const code = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Connection timeout")), 15000);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    clearTimeout(timeout);
                    try {
                        const pairCode = await sock.requestPairingCode(clean);
                        resolve(pairCode);
                    } catch(e) {
                        reject(e);
                    }
                }

                if (connection === 'close') {
                    clearTimeout(timeout);
                    reject(new Error("Connection closed before pairing"));
                }
            });
        });

        await db.ref(`numbers/${clean}`).set({ uid });
        await db.ref(`users/${uid}/numbers/${clean}`).set(true);

        return res.json({ success: true, code });

    } catch (err) {
        console.log("PAIR ERROR:", err.message);
        let errorMsg = "Try again after 1 minute";
        if (err.message.includes('rate-overlimit')) errorMsg = "Rate limit! Try again after 5 mins.";
        else if (err.message.includes('Connection Closed')) errorMsg = "Connection dropped. Try again.";
        else if (err.message.includes('timeout')) errorMsg = "Connection timeout. Try again.";
        return res.json({ success: false, msg: errorMsg });
    }
});

// =======================
// 🔥 REMOVE
// =======================
app.post('/remove', async (req, res) => {
    try {
        const { uid, number } = req.body || {};
        if (!uid || !number) return res.json({ success: false, msg: "Missing Data" });

        const clean = number.replace(/[^0-9]/g, '');
        const sessionId = `${uid}_${clean}`;

        const sock = sessions[sessionId];
        if (sock) {
            try { await sock.logout(); } catch (e) { sock.ws?.close(); }
            delete sessions[sessionId];
        }

        await db.ref(`sessions/${sessionId}`).remove();
        await db.ref(`numbers/${clean}`).remove();
        await db.ref(`users/${uid}/numbers/${clean}`).remove();

        return res.json({ success: true });
    } catch (e) {
        console.log("REMOVE ERROR:", e.message);
        return res.json({ success: false });
    }
});

// =======================
// 🔥 STATUS
// =======================
app.post('/status', (req, res) => {
    try {
        const { uid, number } = req.body || {};
        if (!uid || !number) return res.json({ connected: false });

        const clean = number.replace(/[^0-9]/g, '');
        const sessionId = `${uid}_${clean}`;

        return res.json({
            connected: !!sessions[sessionId]?.user
        });
    } catch (e) {
        return res.json({ connected: false });
    }
});

// =======================
// 🚀 START
// =======================
app.listen(PORT, async () => {
    console.log(`🚀 RUNNING ON ${PORT}`);
    await restoreSessions();
});
