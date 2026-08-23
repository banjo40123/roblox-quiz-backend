# roblox-quiz-backend

Backend สำหรับเกม Roblox "ผนังแห่งทางเลือก" — ระบบพัฒนาภูมิคุ้มกันในการใช้สื่อออนไลน์
ใช้แบบทดสอบการติดเกม GAST (Game Addiction Screening Test) ฉบับเด็กและวัยรุ่น 16 ข้อ
พัฒนาโดยสถาบันสุขภาพจิตเด็กและวัยรุ่นราชนครินทร์ กรมสุขภาพจิต ร่วมกับ นพ.ชาญวิทย์ พรนภดล

## โครงสร้างงานวิจัย 3 ระยะ

```
1) Pre-test (GAST 16 ข้อ)  →  2) เล่นเกม Roblox  →  3) Post-test (GAST 16 ข้อ)
```

- **Pre-test** (`public/pretest.html`) — นักเรียนทำก่อนเล่นเกม บันทึกผลผ่าน `POST /api/pretest`
- **เล่นเกม** — บันทึกคะแนนในเกม (Risk Score, ด่านที่ผ่าน ฯลฯ) ผ่าน `POST /api/submit-result`
  เป็น**ข้อมูลเสริม** ไม่ได้นำมาเทียบกับ GAST โดยตรง
- **Post-test** (`public/posttest.html`) — นักเรียนทำหลังเล่นเกมจบ ต้องใช้ **รหัสผู้เล่นเดียวกัน**
  กับตอนทำ Pre-test บันทึกผลผ่าน `POST /api/posttest`
- การวัดผลก่อน–หลังที่แท้จริงของงานวิจัยคือการเทียบ **Pre-test กับ Post-test**
  (คะแนนเต็ม 48 เท่ากันทั้งคู่ เทียบดิบได้เลยไม่ต้องแปลงร้อยละ) ดูได้ที่ `public/pretest-dashboard.html`

## หน้าเว็บ (public/)

| ไฟล์ | หน้าที่ |
|---|---|
| `pretest.html` | แบบประเมิน GAST ก่อนเล่นเกม |
| `posttest.html` | แบบประเมิน GAST หลังเล่นเกม พร้อมเทียบผลกับ Pre-test ให้เห็นทันที |
| `pretest-dashboard.html` | ดูข้อมูล Pre/Post-test ทั้งหมด, ตารางเปรียบเทียบ, กราฟรายมิติ, export CSV |
| `roblox-reports.html` | คะแนนดิบจากการเล่นเกม (ข้อมูลเสริม) |

## เกณฑ์แปลผล GAST

จุดตัดคะแนนแยกตามเพศ (จากเอกสารต้นฉบับ "การคัดกรองสุขภาพจิตเด็กวัยเรียน" หน้า 73):

| เพศ | ปกติ | คลั่งไคล้ (เริ่มมีปัญหา) | น่าจะติดเกม |
|---|---|---|---|
| ชาย | < 24 | 24–32 | ≥ 33 |
| หญิง | < 16 | 16–22 | ≥ 23 |

กรณี "ไม่ระบุเพศ" ใช้เกณฑ์ฉบับหญิง (จุดตัดต่ำกว่า = คัดกรองไวกว่า — เป็นทางเลือกของผู้วิจัย ควรระบุเป็นข้อจำกัดในเล่ม)

มิติ (ยึดตามเอกสารต้นฉบับ ไม่ใช่การแบ่งแบบเดา):
- **หมกมุ่นกับเกม (P)** — ข้อ 1, 8, 9, 11, 13, 16 (6 ข้อ, เต็ม 18)
- **สูญเสียการควบคุม (C)** — ข้อ 2, 4, 5, 6, 12 (5 ข้อ, เต็ม 15)
- **ผลกระทบต่อหน้าที่รับผิดชอบ (I)** — ข้อ 3, 7, 10, 14, 15 (5 ข้อ, เต็ม 15)

## API Endpoints

### Pre-test / Post-test
| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/pretest` | บันทึกผล Pre-test (กันตอบซ้ำในวันเดียวกัน) |
| GET | `/api/pretest` | ดึงผล Pre-test ทั้งหมด |
| GET | `/api/pretest/:playerId` | ดึงผล Pre-test ของผู้เล่นรายเดียว |
| POST | `/api/posttest` | บันทึกผล Post-test (ตรรกะเดียวกับ Pre-test) |
| GET | `/api/posttest` | ดึงผล Post-test ทั้งหมด |
| GET | `/api/posttest/:playerId` | ดึงผล Post-test ของผู้เล่นรายเดียว |
| GET | `/api/comparison` | จับคู่ Pre/Post ด้วย playerId ตรงกัน (Post ต้องทำหลัง Pre) |
| GET | `/api/export/comparison-csv` | ดาวน์โหลดตารางเปรียบเทียบเป็น CSV |
| POST | `/api/admin/rename-player` | แก้รหัสผู้เล่นที่พิมพ์ผิด (ต้องมี header `x-api-key`) |

### ผลจากเกม (ข้อมูลเสริม)
| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/submit-result` | Roblox ส่งผลมาที่นี่ (ต้องมี header `x-api-key`) |
| GET | `/api/results` | ดึงผลการเล่นเกมทั้งหมด |
| GET | `/api/stats` | สถิติสรุป (ใช้ในหน้า roblox-reports.html) |
| POST | `/api/reset` | ล้างข้อมูลผลเกมทั้งหมด (ต้องมี header `x-api-key`) |
| GET | `/health` | เช็คสถานะเซิร์ฟเวอร์ |

## ฐานข้อมูล — MongoDB Atlas

เก็บข้อมูลใน MongoDB (ไม่ใช้ไฟล์ JSON แล้ว เพราะ Render free tier มี disk แบบ ephemeral
ข้อมูลจะหายทุกครั้งที่ container restart/idle) มี 3 collection:

- `pretests` — ผล Pre-test
- `posttests` — ผล Post-test
- `gameResults` — ผลจากการเล่นเกม (ข้อมูลเสริม)

### ตั้งค่าบน Render

1. สร้าง Cluster ฟรีที่ [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. สร้าง Database User (username/password) และตั้งค่า Network Access ให้ allow จากทุกที่
   (`0.0.0.0/0`) เพราะ Render ไม่มี IP คงที่
3. คัดลอก Connection string จากปุ่ม "Connect" → "Drivers" (รูปแบบ `mongodb+srv://...`)
4. ไปที่ Render Dashboard → เลือก service นี้ → **Environment** แล้วตั้งค่าตัวแปรตาม
   `.env.example`:
   - `MONGODB_URI` — connection string จากขั้นตอนที่ 3
   - `MONGODB_DB` — ชื่อฐานข้อมูล (ไม่ต้องสร้างล่วงหน้า) แนะนำ `gast_quiz`
   - `API_SECRET` — ต้องตรงกับค่าที่ตั้งไว้ใน `HttpReporter.lua` ฝั่งเกม Roblox
5. Deploy ใหม่ — เซิร์ฟเวอร์จะเชื่อมต่อ MongoDB อัตโนมัติตอนมี request แรกเข้ามา
   ถ้าเชื่อมต่อไม่ได้ จะไม่ทำให้ server ล่ม แต่ endpoint ที่ต้องใช้ฐานข้อมูลจะตอบ 500
   พร้อม log error ที่ชัดเจนใน Render Logs

### รันในเครื่อง (Local Development)

```bash
cp .env.example .env   # แล้วแก้ MONGODB_URI ให้เป็นของจริง
npm install
npm start
```

### ย้ายข้อมูลเก่าจากไฟล์ JSON (ถ้ามี)

ถ้ามีไฟล์ `data/pretests.json`, `data/posttests.json`, หรือ `data/results.json` ค้างอยู่
(เช่น backup ที่ export ไว้ก่อนย้ายมาใช้ MongoDB) รันคำสั่งนี้เพื่อนำเข้า:

```bash
node scripts/migrate.js
```

สคริปต์นี้เรียกซ้ำได้อย่างปลอดภัย (idempotent) — ข้อมูลที่มี `id` ซ้ำกับที่อยู่ใน MongoDB
อยู่แล้วจะถูกข้าม ไม่สร้างซ้ำ

## ⚠️ ข้อจำกัดของเครื่องมือนี้

แบบทดสอบ GAST เป็นเพียงเครื่องมือ "คัดกรอง" เบื้องต้น ไม่ใช่เครื่องมือ "วินิจฉัย" ทางการแพทย์
ผลที่ได้ไม่สามารถใช้สรุปว่าเด็กติดเกมจริงหรือไม่ หากผลออกมาในกลุ่มเสี่ยงหรือน่าจะติดเกม
ควรแนะนำให้ปรึกษาจิตแพทย์เด็กและวัยรุ่นหรือนักจิตวิทยาเพื่อประเมินอย่างละเอียดต่อไป
