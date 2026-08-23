const express = require('express');
const path = require('path');
const cors = require('cors');
const pretestRouter = require('./routes/pretest');
const { getCollection } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'change-this-secret-now';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', pretestRouter);

// เสิร์ฟไฟล์ static จาก public/ (index.html จะถูกเสิร์ฟอัตโนมัติเมื่อเข้า /)
app.use(express.static(path.join(__dirname, 'public')));

// ผลจากเกม Roblox เก็บใน collection "gameResults"
// เป็นข้อมูลเสริม (ไม่นำมาเทียบกับ Pre/Post GAST โดยตรง — ดู routes/pretest.js)
async function loadAll() {
  const col = await getCollection('gameResults');
  return col.find({}, { projection: { _id: 0 } }).toArray();
}
async function insertOne(doc) {
  const col = await getCollection('gameResults');
  await col.insertOne(doc);
}
async function clearAll() {
  const col = await getCollection('gameResults');
  await col.deleteMany({});
}

// Roblox ส่งผลลัพธ์มาตรงนี้
app.post('/api/submit-result', async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const r = req.body || {};
    if (!r.playerId || !r.playerName) {
      return res.status(400).json({ error: 'Missing playerId/playerName' });
    }
    r.submittedAt = new Date().toISOString();
    r.id = `${r.playerId}_${Date.now()}`;
    await insertOne(r);
    res.json({ success: true, id: r.id });
  } catch (e) {
    console.error('[submit-result] เขียนข้อมูลไม่สำเร็จ:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/results', async (_req, res) => {
  try {
    res.json(await loadAll());
  } catch (e) {
    console.error('[results] อ่านข้อมูลไม่สำเร็จ:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats', async (_req, res) => {
  try {
    const all = await loadAll();
    const stats = {
      totalSubmissions: all.length,
      uniquePlayers: new Set(all.map(r => r.playerId)).size,
      avgRiskScore: 0,
      avgCompletionTime: 0,
      riskGroups: { normal: 0, risk: 0, addicted: 0 },
      avgStage: { s1: 0, s2: 0, s3: 0 },
    };
    if (all.length) {
      const sum = (k) => all.reduce((s, r) => s + (r[k] || 0), 0);
      stats.avgRiskScore = +(sum('riskScore') / all.length).toFixed(1);
      stats.avgCompletionTime = Math.round(sum('completionTimeSec') / all.length);
      stats.avgStage.s1 = +(sum('riskStage1') / all.length).toFixed(1);
      stats.avgStage.s2 = +(sum('riskStage2') / all.length).toFixed(1);
      stats.avgStage.s3 = +(sum('riskStage3') / all.length).toFixed(1);
      all.forEach(r => {
        const g = r.riskGroup || (r.riskScore <= 10 ? 'normal' : r.riskScore <= 25 ? 'risk' : 'addicted');
        stats.riskGroups[g] = (stats.riskGroups[g] || 0) + 1;
      });
    }
    res.json(stats);
  } catch (e) {
    console.error('[stats] คำนวณสถิติไม่สำเร็จ:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await clearAll();
    res.json({ success: true });
  } catch (e) {
    console.error('[reset] ล้างข้อมูลไม่สำเร็จ:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
