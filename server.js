const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'change-this-secret-now';
const DATA_FILE = path.join(__dirname, 'data', 'results.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// เสิร์ฟไฟล์ static จาก public/ (index.html จะถูกเสิร์ฟอัตโนมัติเมื่อเข้า /)
app.use(express.static(path.join(__dirname, 'public')));

async function ensureFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try { await fs.access(DATA_FILE); }
  catch { await fs.writeFile(DATA_FILE, '[]'); }
}
async function loadAll() {
  await ensureFile();
  return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
}
async function saveAll(list) {
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2));
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
    const all = await loadAll();
    all.push(r);
    await saveAll(all);
    res.json({ success: true, id: r.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/results', async (_req, res) => {
  res.json(await loadAll());
});

app.get('/api/stats', async (_req, res) => {
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
      const g = r.riskGroup || (r.riskScore <= 10 ? 'normal' : r.riskScore <= 20 ? 'risk' : 'addicted');
      stats.riskGroups[g] = (stats.riskGroups[g] || 0) + 1;
    });
  }
  res.json(stats);
});

app.post('/api/reset', async (req, res) => {
  if (req.headers['x-api-key'] !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await saveAll([]);
  res.json({ success: true });
});

app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));