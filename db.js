/* ═══════════════════════════════════════════════════════════════════
   db.js — จัดการการเชื่อมต่อ MongoDB
   ───────────────────────────────────────────────────────────────────
   ใช้ driver ตรง ๆ (ไม่ใช้ mongoose) เพื่อลด dependency
   เชื่อมต่อครั้งเดียวแล้ว reuse — ไม่เปิด connection ใหม่ทุก request
   ═══════════════════════════════════════════════════════════════════ */

const { MongoClient } = require('mongodb');

const uri    = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'gast_quiz';

let clientPromise = null;

/* ─── เชื่อมต่อ (หรือคืน promise ที่เชื่อมอยู่แล้ว) ─────────────────
   ถ้าเชื่อมต่อไม่สำเร็จ จะ log error ให้ชัดเจน และล้าง clientPromise
   ทิ้งเพื่อให้ครั้งถัดไปลองเชื่อมใหม่ได้ (ไม่ทำให้ server ล่ม)
   ───────────────────────────────────────────────────────────── */
function connect() {
  if (!uri) {
    return Promise.reject(new Error(
      'ไม่ได้ตั้งค่า MONGODB_URI ใน environment variables — ดูวิธีตั้งค่าใน .env.example'
    ));
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect()
      .then((connected) => {
        console.log('[MongoDB] เชื่อมต่อสำเร็จ');
        return connected;
      })
      .catch((err) => {
        console.error('[MongoDB] เชื่อมต่อไม่สำเร็จ:', err.message);
        clientPromise = null; // ให้ลองเชื่อมใหม่ได้ในครั้งถัดไป
        throw err;
      });
  }
  return clientPromise;
}

/* ─── ดึง Database instance (เรียกใช้ได้จากทุก route) ───────────── */
async function getDb() {
  const client = await connect();
  return client.db(dbName);
}

/* ─── ดึง Collection instance ตรง ๆ (สะดวกกว่าเรียก getDb ทุกครั้ง) ── */
async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = { connect, getDb, getCollection };
