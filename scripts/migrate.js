/* ═══════════════════════════════════════════════════════════════════
   scripts/migrate.js
   ───────────────────────────────────────────────────────────────────
   ย้ายข้อมูลเดิมจากไฟล์ JSON (data/pretests.json, data/results.json,
   data/posttests.json ถ้ามี) เข้า MongoDB

   วิธีใช้:
     1) ตั้งค่า MONGODB_URI ไว้ก่อน (export env var หรือใช้ .env กับ dotenv เอง)
     2) รันคำสั่ง: node scripts/migrate.js

   สคริปต์นี้เรียกซ้ำได้อย่างปลอดภัย (idempotent) — ถ้า id ใดมีอยู่ใน
   MongoDB แล้ว จะข้ามรายการนั้นไป ไม่สร้างซ้ำ
   ═══════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const { getCollection } = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');

const SOURCES = [
  { file: 'pretests.json',  collection: 'pretests'   },
  { file: 'posttests.json', collection: 'posttests'  },
  { file: 'results.json',   collection: 'gameResults' },
];

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`  ⚠️ อ่านไฟล์ ${filePath} ไม่สำเร็จ:`, err.message);
    return null;
  }
}

async function migrateOne({ file, collection }) {
  const filePath = path.join(DATA_DIR, file);
  const records = readJsonSafe(filePath);

  if (!records) {
    console.log(`— ${file}: ไม่พบไฟล์ ข้ามการย้ายข้อมูลชุดนี้`);
    return;
  }
  if (!Array.isArray(records) || !records.length) {
    console.log(`— ${file}: ไม่มีข้อมูล (0 รายการ)`);
    return;
  }

  const col = await getCollection(collection);
  let inserted = 0;
  let skipped  = 0;

  for (const record of records) {
    if (record.id) {
      const exists = await col.findOne({ id: record.id });
      if (exists) { skipped += 1; continue; }
    }
    await col.insertOne(record);
    inserted += 1;
  }

  console.log(`✔ ${file} → ${collection}: เพิ่มใหม่ ${inserted} รายการ, ข้าม (มีอยู่แล้ว) ${skipped} รายการ`);
}

async function main() {
  console.log('เริ่มย้ายข้อมูลจากไฟล์ JSON เข้า MongoDB...\n');
  for (const source of SOURCES) {
    await migrateOne(source);
  }
  console.log('\nเสร็จสิ้น');
  process.exit(0);
}

main().catch((err) => {
  console.error('การย้ายข้อมูลล้มเหลว:', err.message);
  process.exit(1);
});
