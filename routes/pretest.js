/* ═══════════════════════════════════════════════════════════════════
   routes/pretest.js
   ───────────────────────────────────────────────────────────────────
   ระบบ Pre-test / Post-test ของ roblox-quiz-backend
   เก็บข้อมูลใน MongoDB (collection: pretests, posttests)
   ผลจากเกม Roblox (collection: gameResults) เป็นข้อมูลเสริม จัดการใน server.js
   ═══════════════════════════════════════════════════════════════════ */

const express = require('express');
const { getCollection } = require('../db');

const router = express.Router();

/* ─── เกณฑ์แปลผล ──────────────────────────────────────────────
   ค่าจริงจาก "การคัดกรองสุขภาพจิตเด็กวัยเรียน" หน้า 73
   สถาบันสุขภาพจิตเด็กและวัยรุ่นราชนครินทร์ กรมสุขภาพจิต (ฉบับเด็กและวัยรุ่น)
   จุดตัดแยกตามเพศ — ต้องตรงกับตรรกะใน public/pretest.html และ posttest.html
   ใช้เกณฑ์เดียวกันทั้ง Pre-test และ Post-test เพราะเป็นแบบทดสอบชุดเดียวกัน (16 ข้อ เต็ม 48)
   ⚠️ กรณี "ไม่ระบุเพศ" เอกสารต้นฉบับไม่ได้กำหนดจุดตัดไว้ — ใช้เกณฑ์ฉบับ "หญิง" แทน
   ───────────────────────────────────────────────────────────── */
const GAST_MAX = 48; // 16 ข้อ x 3 คะแนน — คะแนนเต็มของทั้ง Pre-test และ Post-test

const CUTOFF_BY_GENDER = {
  'ชาย' : [{ key:'normal', min:0 }, { key:'risk', min:24 }, { key:'addict', min:33 }],
  'หญิง': [{ key:'normal', min:0 }, { key:'risk', min:16 }, { key:'addict', min:23 }],
};
CUTOFF_BY_GENDER['ไม่ระบุ'] = CUTOFF_BY_GENDER['หญิง'];

function classifyGast(score, gender) {
  const tiers = CUTOFF_BY_GENDER[gender] || CUTOFF_BY_GENDER['ไม่ระบุ'];
  let picked = tiers[0].key;
  for (const t of tiers) if (score >= t.min) picked = t.key;
  return picked;
}

/* ─── ฟังก์ชันช่วยเข้าถึง MongoDB ──────────────────────────────
   ทุกฟังก์ชัน project ตัด _id ทิ้ง เพื่อให้รูปแบบข้อมูลที่ส่งกลับ
   เหมือนกับตอนที่ยังเก็บเป็นไฟล์ JSON ทุกประการ
   ───────────────────────────────────────────────────────────── */
async function findAll(collectionName, filter = {}) {
  const col = await getCollection(collectionName);
  return col.find(filter, { projection: { _id: 0 } }).toArray();
}
async function insertRecord(collectionName, doc) {
  const col = await getCollection(collectionName);
  await col.insertOne(doc);
}
async function findDuplicateToday(collectionName, playerId) {
  const today = new Date().toISOString().slice(0, 10);
  const docs = await findAll(collectionName, { playerId });
  return docs.find(d => String(d.timestamp || '').slice(0, 10) === today);
}

/* ═══════════════════════════════════════════════════════════════
   ฟังก์ชันร่วมสำหรับบันทึกผล Pre-test / Post-test
   (โครงสร้างข้อมูลและการตรวจสอบเหมือนกันทุกประการ ต่างกันแค่ collection
   และ testType ที่ client ส่งมา)
   ═══════════════════════════════════════════════════════════════ */
async function handleSubmitTest(req, res, collectionName, requiredAnswerCount) {
  const b = req.body;

  const required = ['playerId', 'gender', 'age', 'grade', 'totalScore', 'answers'];
  const missing  = required.filter(f => b[f] === undefined || b[f] === null || b[f] === '');

  if (missing.length) {
    return res.status(400).json({ success: false, error: 'ข้อมูลไม่ครบ', missing });
  }

  if (!Array.isArray(b.answers) || b.answers.length !== requiredAnswerCount) {
    return res.status(400).json({
      success: false,
      error: `ต้องตอบคำถามให้ครบ ${requiredAnswerCount} ข้อ`,
      received: Array.isArray(b.answers) ? b.answers.length : 0,
    });
  }

  try {
    const dup = await findDuplicateToday(collectionName, b.playerId);
    if (dup) {
      return res.status(409).json({
        success  : false,
        error    : 'ผู้เล่นรายนี้ทำแบบประเมินไปแล้วในวันนี้',
        existing : { id: dup.id, totalScore: dup.totalScore, riskLevel: dup.riskLevel },
      });
    }

    const record = {
      id         : `${collectionName === 'posttests' ? 'POST' : 'PRE'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId   : b.playerId,
      gender     : b.gender,
      age        : b.age,
      grade      : b.grade,
      dailyPlayTime  : b.dailyPlayTime || 'ไม่ระบุ',
      totalScore     : b.totalScore,
      maxScore       : b.maxScore || GAST_MAX,
      scorePercent   : +(b.totalScore / GAST_MAX * 100).toFixed(2),
      dimensionScores: b.dimensionScores || {},
      riskLevel      : classifyGast(b.totalScore, b.gender),
      answers        : b.answers,
      timestamp      : b.timestamp || new Date().toISOString(),
    };

    await insertRecord(collectionName, record);

    console.log(`[${collectionName.toUpperCase()}] ${record.playerId} → ${record.totalScore} คะแนน (${record.riskLevel})`);

    res.status(201).json({
      success: true,
      data: {
        id         : record.id,
        totalScore : record.totalScore,
        riskLevel  : record.riskLevel,
        dimensionScores: record.dimensionScores,
      },
    });
  } catch (err) {
    console.error(`[${collectionName}] บันทึกข้อมูลไม่สำเร็จ:`, err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/pretest   — บันทึกผล Pre-test
   ═══════════════════════════════════════════════════════════════ */
router.post('/pretest', (req, res) => handleSubmitTest(req, res, 'pretests', 16));

/* ═══════════════════════════════════════════════════════════════
   GET /api/pretest            — ดึงผล Pre-test ทั้งหมด
   GET /api/pretest/:playerId  — ดึงผลของผู้เล่นรายเดียว
   ═══════════════════════════════════════════════════════════════ */
router.get('/pretest', async (req, res) => {
  try {
    const pretests = await findAll('pretests');
    res.json({ success: true, count: pretests.length, data: pretests });
  } catch (err) {
    console.error('[pretest] อ่านข้อมูลไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

router.get('/pretest/:playerId', async (req, res) => {
  try {
    const found = await findAll('pretests', { playerId: req.params.playerId });
    if (!found.length) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้เล่นรายนี้' });
    }
    res.json({ success: true, data: found });
  } catch (err) {
    console.error('[pretest/:playerId] อ่านข้อมูลไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/posttest  — บันทึกผล Post-test (ทำหลังเล่นเกมจบ)
   ตรรกะเดียวกับ /api/pretest ทุกประการ ต่างกันแค่ collection
   ═══════════════════════════════════════════════════════════════ */
router.post('/posttest', (req, res) => handleSubmitTest(req, res, 'posttests', 16));

/* ═══════════════════════════════════════════════════════════════
   GET /api/posttest            — ดึงผล Post-test ทั้งหมด
   GET /api/posttest/:playerId  — ดึงผลของผู้เล่นรายเดียว
   ═══════════════════════════════════════════════════════════════ */
router.get('/posttest', async (req, res) => {
  try {
    const posttests = await findAll('posttests');
    res.json({ success: true, count: posttests.length, data: posttests });
  } catch (err) {
    console.error('[posttest] อ่านข้อมูลไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

router.get('/posttest/:playerId', async (req, res) => {
  try {
    const found = await findAll('posttests', { playerId: req.params.playerId });
    if (!found.length) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้เล่นรายนี้' });
    }
    res.json({ success: true, data: found });
  } catch (err) {
    console.error('[posttest/:playerId] อ่านข้อมูลไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   สร้างตารางจับคู่ Pre-test กับ Post-test ของผู้เล่นคนเดียวกัน
   (playerId ตรงกันเป๊ะ + Post-test ต้องทำ "หลัง" Pre-test เท่านั้น)
   คะแนนเต็มเท่ากันทั้งคู่ (48) จึงเทียบคะแนนดิบได้เลย ไม่ต้องแปลงร้อยละ
   ═══════════════════════════════════════════════════════════════ */
async function buildComparison() {
  const pretests  = await findAll('pretests');
  const posttests = await findAll('posttests');

  const paired = [];

  pretests.forEach(pre => {
    const matches = posttests
      .filter(post => post.playerId === pre.playerId &&
                       new Date(post.timestamp) > new Date(pre.timestamp))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!matches.length) return; // ยังไม่ได้ทำ Post-test → ข้าม

    const post = matches[0];
    const changeScore = post.totalScore - pre.totalScore; // ค่าลบ = คะแนนความเสี่ยงลดลง = ดีขึ้น

    paired.push({
      playerId : pre.playerId,
      gender   : pre.gender,
      age      : pre.age,
      grade    : pre.grade,

      preScore  : pre.totalScore,
      preLevel  : pre.riskLevel,
      postScore : post.totalScore,
      postLevel : post.riskLevel,

      changeScore,
      improved     : changeScore < 0,
      levelChanged : pre.riskLevel !== post.riskLevel,

      // ข้อมูลรายมิติ ไว้ให้แดชบอร์ดวาดกราฟเปรียบเทียบ Pre/Post แต่ละมิติ
      preDimensions  : pre.dimensionScores  || {},
      postDimensions : post.dimensionScores || {},
    });
  });

  const n = paired.length;
  const summary = n ? {
    totalPaired    : n,
    improvedCount  : paired.filter(p => p.improved).length,
    improvedPercent: +(paired.filter(p => p.improved).length / n * 100).toFixed(2),
    meanPreScore   : +(paired.reduce((s, p) => s + p.preScore, 0) / n).toFixed(2),
    meanPostScore  : +(paired.reduce((s, p) => s + p.postScore, 0) / n).toFixed(2),
    meanChange     : +(paired.reduce((s, p) => s + p.changeScore, 0) / n).toFixed(2),
  } : { totalPaired: 0 };

  return { summary, paired };
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/comparison  — เปรียบเทียบ Pre-test กับ Post-test
   ═══════════════════════════════════════════════════════════════ */
router.get('/comparison', async (req, res) => {
  try {
    const { summary, paired } = await buildComparison();
    res.json({ success: true, summary, data: paired });
  } catch (err) {
    console.error('[comparison] คำนวณไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/export/comparison-csv  — ดาวน์โหลดตารางเปรียบเทียบ
   ═══════════════════════════════════════════════════════════════ */
router.get('/export/comparison-csv', async (req, res) => {
  try {
    const { paired } = await buildComparison();

    const header = [
      'playerId', 'gender', 'age', 'grade',
      'preScore', 'preLevel', 'postScore', 'postLevel',
      'changeScore', 'improved',
    ];

    const rows = paired.map(p => [
      p.playerId, p.gender, p.age, p.grade,
      p.preScore, p.preLevel, p.postScore, p.postLevel,
      p.changeScore,
      p.improved ? 'ดีขึ้น' : 'ไม่ดีขึ้น',
    ].join(','));

    const csv = '﻿' + header.join(',') + '\n' + rows.join('\n');  // BOM กันภาษาไทยเพี้ยนใน Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comparison.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[export/comparison-csv] สร้างไฟล์ไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/admin/rename-player  — แก้ไขรหัสผู้เล่นที่พิมพ์ผิด
   ต้องใส่ header x-api-key ให้ตรงกับ API_SECRET (เหมือน /api/reset ของเดิม)
   แก้ playerId ใน pretests, posttests และ playerId/playerName/displayName
   ใน gameResults เพื่อให้การจับคู่ยังทำงานถูก
   Body: { "oldId": "denchai4451", "newId": "denchaii" }
   ═══════════════════════════════════════════════════════════════ */
router.post('/admin/rename-player', async (req, res) => {
  const API_SECRET = process.env.API_SECRET || 'change-this-secret-now';
  if (req.headers['x-api-key'] !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { oldId, newId } = req.body || {};
  if (!oldId || !newId) {
    return res.status(400).json({ success: false, error: 'ต้องระบุ oldId และ newId' });
  }

  try {
    const preCol  = await getCollection('pretests');
    const postCol = await getCollection('posttests');
    const gameCol = await getCollection('gameResults');

    const preResult  = await preCol.updateMany({ playerId: oldId }, { $set: { playerId: newId } });
    const postResult = await postCol.updateMany({ playerId: oldId }, { $set: { playerId: newId } });

    // ฝั่งเกม รหัสอาจอยู่ใน playerId, playerName หรือ displayName ก็ได้ (case-insensitive)
    const oldLower = String(oldId).trim().toLowerCase();
    const gameDocs = await gameCol.find({}).toArray();
    let gameCount = 0;
    for (const doc of gameDocs) {
      const update = {};
      if (String(doc.playerId || '').trim().toLowerCase() === oldLower)    update.playerId = newId;
      if (String(doc.playerName || '').trim().toLowerCase() === oldLower)  update.playerName = newId;
      if (String(doc.displayName || '').trim().toLowerCase() === oldLower) update.displayName = newId;
      if (Object.keys(update).length) {
        await gameCol.updateOne({ _id: doc._id }, { $set: update });
        gameCount += 1;
      }
    }

    console.log(`[ADMIN] rename-player ${oldId} -> ${newId}: pretests=${preResult.modifiedCount}, posttests=${postResult.modifiedCount}, gameResults=${gameCount}`);

    res.json({
      success: true, oldId, newId,
      pretestsUpdated : preResult.modifiedCount,
      posttestsUpdated: postResult.modifiedCount,
      gameResultsUpdated: gameCount,
    });
  } catch (err) {
    console.error('[admin/rename-player] ทำงานไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
});

module.exports = router;
