/* ═══════════════════════════════════════════════════════════════════
   routes/pretest.js
   ───────────────────────────────────────────────────────────────────
   เพิ่มระบบ Pre-test ให้กับ roblox-quiz-backend
   ═══════════════════════════════════════════════════════════════════ */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/* ─── ที่เก็บข้อมูล ────────────────────────────────────────────── */
const DATA_DIR      = path.join(__dirname, '..', 'data');
const PRETEST_FILE  = path.join(DATA_DIR, 'pretests.json');
const SESSION_FILE  = path.join(DATA_DIR, 'results.json');   // ของเดิม (Post-test จากเกม)

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`อ่านไฟล์ ${file} ไม่สำเร็จ:`, err.message);
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/* ─── เกณฑ์แปลผล ──────────────────────────────────────────────
   ค่าจริงจาก "การคัดกรองสุขภาพจิตเด็กวัยเรียน" หน้า 73
   สถาบันสุขภาพจิตเด็กและวัยรุ่นราชนครินทร์ กรมสุขภาพจิต (ฉบับเด็กและวัยรุ่น)
   จุดตัดแยกตามเพศ — ต้องตรงกับตรรกะใน public/pretest.html (classify())
   PRE เต็ม 48 (16 ข้อ × 3), POST ใช้เกณฑ์เดิมของเกม (server.js: 0-10/11-25/26+ จาก 45 คะแนน)
   ⚠️ กรณี "ไม่ระบุเพศ" เอกสารต้นฉบับไม่ได้กำหนดจุดตัดไว้ — ใช้เกณฑ์ฉบับ "หญิง" แทน
   ───────────────────────────────────────────────────────────── */
const PRE_MAX  = 48;
const POST_MAX = 45;

const PRE_CUTOFF_BY_GENDER = {
  'ชาย' : [{ key:'normal', min:0 }, { key:'risk', min:24 }, { key:'addict', min:33 }],
  'หญิง': [{ key:'normal', min:0 }, { key:'risk', min:16 }, { key:'addict', min:23 }],
};
PRE_CUTOFF_BY_GENDER['ไม่ระบุ'] = PRE_CUTOFF_BY_GENDER['หญิง'];

function classifyPre(score, gender) {
  const tiers = PRE_CUTOFF_BY_GENDER[gender] || PRE_CUTOFF_BY_GENDER['ไม่ระบุ'];
  let picked = tiers[0].key;
  for (const t of tiers) if (score >= t.min) picked = t.key;
  return picked;
}

function classifyPost(score) {
  if (score >= 26) return 'addict';
  if (score >= 11) return 'risk';
  return 'normal';
}

/* ─── ปรับคะแนนให้เทียบกันได้ ─────────────────────────────────
   Pre-test เต็ม 48, Post-test (ในเกม) เต็ม 45
   จึงต้องแปลงเป็นร้อยละก่อนเปรียบเทียบ
   ───────────────────────────────────────────────────────────── */
function toPercent(score, scale) {
  return +(score / (scale === 'PRE' ? PRE_MAX : POST_MAX) * 100).toFixed(2);
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/pretest   — บันทึกผล Pre-test
   ═══════════════════════════════════════════════════════════════ */
router.post('/pretest', (req, res) => {
  const b = req.body;

  // ตรวจข้อมูลที่จำเป็น
  const required = ['playerId', 'gender', 'age', 'grade', 'totalScore', 'answers'];
  const missing  = required.filter(f => b[f] === undefined || b[f] === null || b[f] === '');

  if (missing.length) {
    return res.status(400).json({
      success: false,
      error  : 'ข้อมูลไม่ครบ',
      missing,
    });
  }

  if (!Array.isArray(b.answers) || b.answers.length !== 16) {
    return res.status(400).json({
      success: false,
      error  : 'ต้องตอบคำถามให้ครบ 16 ข้อ',
      received: Array.isArray(b.answers) ? b.answers.length : 0,
    });
  }

  const pretests = readJson(PRETEST_FILE);

  // กันตอบซ้ำในวันเดียวกัน
  const today = new Date().toISOString().slice(0, 10);
  const dup = pretests.find(p =>
    p.playerId === b.playerId && p.timestamp.slice(0, 10) === today);

  if (dup) {
    return res.status(409).json({
      success  : false,
      error    : 'ผู้เล่นรายนี้ทำแบบประเมินไปแล้วในวันนี้',
      existing : { id: dup.id, totalScore: dup.totalScore, riskLevel: dup.riskLevel },
    });
  }

  const record = {
    id         : `PRE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerId   : b.playerId,
    gender     : b.gender,
    age        : b.age,
    grade      : b.grade,
    dailyPlayTime  : b.dailyPlayTime || 'ไม่ระบุ',
    totalScore     : b.totalScore,
    maxScore       : b.maxScore || PRE_MAX,
    scorePercent   : toPercent(b.totalScore, 'PRE'),
    dimensionScores: b.dimensionScores || {},
    riskLevel      : classifyPre(b.totalScore, b.gender),
    answers        : b.answers,
    timestamp      : b.timestamp || new Date().toISOString(),
  };

  pretests.push(record);
  writeJson(PRETEST_FILE, pretests);

  console.log(`[PRE-TEST] ${record.playerId} → ${record.totalScore} คะแนน (${record.riskLevel})`);

  res.status(201).json({
    success: true,
    data: {
      id         : record.id,
      totalScore : record.totalScore,
      riskLevel  : record.riskLevel,
      dimensionScores: record.dimensionScores,
    },
  });
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/pretest            — ดึงผล Pre-test ทั้งหมด
   GET /api/pretest/:playerId  — ดึงผลของผู้เล่นรายเดียว
   ═══════════════════════════════════════════════════════════════ */
router.get('/pretest', (req, res) => {
  const pretests = readJson(PRETEST_FILE);
  res.json({ success: true, count: pretests.length, data: pretests });
});

router.get('/pretest/:playerId', (req, res) => {
  const pretests = readJson(PRETEST_FILE);
  const found = pretests.filter(p => p.playerId === req.params.playerId);

  if (!found.length) {
    return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้เล่นรายนี้' });
  }
  res.json({ success: true, data: found });
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/comparison  — เปรียบเทียบ Pre-test กับ Post-test
   ═══════════════════════════════════════════════════════════════ */
router.get('/comparison', (req, res) => {
  const pretests = readJson(PRETEST_FILE);
  const sessions = readJson(SESSION_FILE);

  const paired = [];

  pretests.forEach(pre => {
    // หา Post-test ของผู้เล่นคนเดียวกัน ที่ทำ "หลัง" Pre-test
    const posts = sessions
      .filter(s => s.playerId === pre.playerId &&
                   new Date(s.submittedAt || s.timestamp) > new Date(pre.timestamp))
      .sort((a, b) => new Date(a.submittedAt || a.timestamp) - new Date(b.submittedAt || b.timestamp));

    if (!posts.length) return;   // ยังไม่ได้เล่นเกม → ข้าม

    const post = posts[0];
    const prePct  = toPercent(pre.totalScore, 'PRE');
    const postPct = toPercent(post.riskScore, 'POST');

    paired.push({
      playerId : pre.playerId,
      gender   : pre.gender,
      age      : pre.age,
      grade    : pre.grade,

      preScore    : pre.totalScore,
      preLevel    : pre.riskLevel,
      prePercent  : prePct,

      postScore   : post.riskScore,
      postLevel   : post.riskGroup,
      postPercent : postPct,

      // ค่าลบ = คะแนนความเสี่ยงลดลง = ภูมิคุ้มกันดีขึ้น
      changePercent : +(postPct - prePct).toFixed(2),
      improved      : postPct < prePct,
      levelChanged  : pre.riskLevel !== post.riskGroup,
    });
  });

  // สถิติสรุป
  const n = paired.length;
  const summary = n ? {
    totalPaired    : n,
    improvedCount  : paired.filter(p => p.improved).length,
    improvedPercent: +(paired.filter(p => p.improved).length / n * 100).toFixed(2),
    meanPrePercent : +(paired.reduce((s, p) => s + p.prePercent, 0) / n).toFixed(2),
    meanPostPercent: +(paired.reduce((s, p) => s + p.postPercent, 0) / n).toFixed(2),
    meanChange     : +(paired.reduce((s, p) => s + p.changePercent, 0) / n).toFixed(2),
  } : { totalPaired: 0 };

  res.json({ success: true, summary, data: paired });
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/export/comparison-csv  — ดาวน์โหลดตารางเปรียบเทียบ
   ═══════════════════════════════════════════════════════════════ */
router.get('/export/comparison-csv', (req, res) => {
  const pretests = readJson(PRETEST_FILE);
  const sessions = readJson(SESSION_FILE);

  const header = [
    'playerId', 'gender', 'age', 'grade',
    'preScore', 'prePercent', 'preLevel',
    'postScore', 'postPercent', 'postLevel',
    'changePercent', 'improved',
  ];

  const rows = [];

  pretests.forEach(pre => {
    const posts = sessions
      .filter(s => s.playerId === pre.playerId &&
                   new Date(s.submittedAt || s.timestamp) > new Date(pre.timestamp))
      .sort((a, b) => new Date(a.submittedAt || a.timestamp) - new Date(b.submittedAt || b.timestamp));

    if (!posts.length) return;

    const post    = posts[0];
    const prePct  = toPercent(pre.totalScore, 'PRE');
    const postPct = toPercent(post.riskScore, 'POST');

    rows.push([
      pre.playerId, pre.gender, pre.age, pre.grade,
      pre.totalScore, prePct, pre.riskLevel,
      post.riskScore, postPct, post.riskGroup,
      (postPct - prePct).toFixed(2),
      postPct < prePct ? 'ดีขึ้น' : 'ไม่ดีขึ้น',
    ].join(','));
  });

  const csv = '﻿' + header.join(',') + '\n' + rows.join('\n');  // BOM กันภาษาไทยเพี้ยนใน Excel

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="comparison.csv"');
  res.send(csv);
});

module.exports = router;
