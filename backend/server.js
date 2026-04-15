import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));

// ─── In-memory store ──────────────────────────────────────────────────────────
const USERS = [
  { id: '1', email: 'demo@example.com', password: 'demo1234' }
];
const SESSIONS = new Map(); // token → userId

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !SESSIONS.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = SESSIONS.get(token);
  next();
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const token = uuidv4();
  SESSIONS.set(token, user.id);
  res.json({ token, email: user.email });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  SESSIONS.delete(token);
  res.json({ ok: true });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
  if (USERS.find(u => u.email === email))
    return res.status(409).json({ error: 'Email already registered' });
  const user = { id: uuidv4(), email, password };
  USERS.push(user);
  const token = uuidv4();
  SESSIONS.set(token, user.id);
  res.json({ token, email: user.email });
});

// ─── Data cleaning ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx]; });
    rows.push(row);
  }
  return { headers, rows };
}

function cleanData(headers, rows) {
  const issues = [];

  // 1. Remove fully empty rows
  const before = rows.length;
  rows = rows.filter(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined));
  const emptyRemoved = before - rows.length;
  if (emptyRemoved > 0) issues.push(`Removed ${emptyRemoved} empty row(s)`);

  // 2. Remove duplicate rows
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) { seen.add(key); deduped.push(row); }
  }
  const dupsRemoved = rows.length - deduped.length;
  if (dupsRemoved > 0) issues.push(`Removed ${dupsRemoved} duplicate row(s)`);
  rows = deduped;

  // 3. Track missing values per column
  const missingCounts = {};
  headers.forEach(h => { missingCounts[h] = 0; });
  for (const row of rows) {
    headers.forEach(h => {
      if (row[h] === '' || row[h] === null || row[h] === undefined) missingCounts[h]++;
    });
  }
  const missingCols = Object.entries(missingCounts).filter(([, c]) => c > 0);
  if (missingCols.length > 0) {
    missingCols.forEach(([col, count]) => issues.push(`Column "${col}": ${count} missing value(s)`));
  }

  // 4. Trim whitespace in all cells
  rows = rows.map(r => {
    const cleaned = {};
    headers.forEach(h => { cleaned[h] = (r[h] || '').toString().trim(); });
    return cleaned;
  });

  // 5. Detect column types
  const colTypes = {};
  headers.forEach(h => {
    const vals = rows.map(r => r[h]).filter(v => v !== '');
    const allNum = vals.every(v => !isNaN(parseFloat(v)) && isFinite(v));
    colTypes[h] = allNum ? 'numeric' : 'text';
  });

  // 6. Basic stats for numeric columns
  const stats = {};
  headers.forEach(h => {
    if (colTypes[h] === 'numeric') {
      const nums = rows.map(r => parseFloat(r[h])).filter(n => !isNaN(n));
      if (nums.length === 0) return;
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const sorted = [...nums].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      stats[h] = {
        min: Math.min(...nums),
        max: Math.max(...nums),
        mean: parseFloat(mean.toFixed(2)),
        median: parseFloat(median.toFixed(2)),
        count: nums.length
      };
    } else {
      const freq = {};
      rows.forEach(r => { if (r[h]) freq[r[h]] = (freq[r[h]] || 0) + 1; });
      const topEntries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
      stats[h] = { type: 'text', topValues: topEntries, uniqueCount: Object.keys(freq).length };
    }
  });

  return { rows, issues, colTypes, stats, rowCount: rows.length };
}

app.post('/api/data/clean', requireAuth, upload.single('file'), (req, res) => {
  try {
    let csvText = '';
    if (req.file) {
      csvText = req.file.buffer.toString('utf-8');
    } else if (req.body.rawData) {
      csvText = req.body.rawData;
    } else {
      return res.status(400).json({ error: 'Provide a CSV file or raw CSV data' });
    }

    const { headers, rows: rawRows } = parseCSV(csvText);
    const result = cleanData(headers, rawRows);
    res.json({ headers, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Insights via Claude ──────────────────────────────────────────────────────
app.post('/api/insights/generate', requireAuth, async (req, res) => {
  const { headers, stats, colTypes, rowCount, issues } = req.body;
  if (!headers || !stats) return res.status(400).json({ error: 'Missing data summary' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: rule-based insights when no API key configured
    return res.json({ insights: generateRuleBasedInsights({ headers, stats, colTypes, rowCount, issues }) });
  }

  try {
    const client = new Anthropic({ apiKey });

    const prompt = buildInsightPrompt({ headers, stats, colTypes, rowCount, issues });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are a concise business analyst. Analyze the given dataset summary and return structured business insights as JSON. Be direct and actionable.',
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].text;
    // Extract JSON from response
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return res.json({ insights: parsed });
    }
    return res.json({ insights: { raw: text } });
  } catch (err) {
    console.error('Claude API error:', err.message);
    return res.json({ insights: generateRuleBasedInsights({ headers, stats, colTypes, rowCount, issues }) });
  }
});

function buildInsightPrompt({ headers, stats, colTypes, rowCount, issues }) {
  const summaryLines = headers.map(h => {
    const s = stats[h];
    if (colTypes[h] === 'numeric') {
      return `- ${h} (numeric): min=${s.min}, max=${s.max}, mean=${s.mean}, median=${s.median}, count=${s.count}`;
    } else {
      const top = s.topValues?.map(([v, c]) => `${v}(${c})`).join(', ');
      return `- ${h} (text): ${s.uniqueCount} unique values, top: ${top}`;
    }
  }).join('\n');

  return `Dataset Summary:
- Total rows (after cleaning): ${rowCount}
- Columns: ${headers.join(', ')}
- Cleaning issues found: ${issues.length > 0 ? issues.join('; ') : 'none'}

Column Statistics:
${summaryLines}

Based on this data, provide business insights in this exact JSON format:
\`\`\`json
{
  "summary": "2-3 sentence overview of what this data represents",
  "keyFindings": [
    "Finding 1 with specific numbers",
    "Finding 2 with specific numbers",
    "Finding 3 with specific numbers"
  ],
  "nextSteps": [
    { "action": "Short action title", "detail": "Why and how to do it" },
    { "action": "Short action title", "detail": "Why and how to do it" },
    { "action": "Short action title", "detail": "Why and how to do it" }
  ],
  "dataQuality": "Brief assessment of data quality and completeness"
}
\`\`\``;
}

function generateRuleBasedInsights({ headers, stats, colTypes, rowCount, issues }) {
  const numericCols = headers.filter(h => colTypes[h] === 'numeric');
  const textCols = headers.filter(h => colTypes[h] === 'text');

  const keyFindings = [];
  numericCols.slice(0, 3).forEach(h => {
    const s = stats[h];
    keyFindings.push(`${h} ranges from ${s.min} to ${s.max} with a mean of ${s.mean}`);
  });
  textCols.slice(0, 2).forEach(h => {
    const s = stats[h];
    if (s.topValues?.length > 0) {
      keyFindings.push(`"${h}" has ${s.uniqueCount} unique categories; most common: ${s.topValues[0][0]} (${s.topValues[0][1]} occurrences)`);
    }
  });

  return {
    summary: `Your dataset contains ${rowCount} clean records across ${headers.length} columns (${numericCols.length} numeric, ${textCols.length} categorical). ${issues.length > 0 ? `${issues.length} data quality issue(s) were fixed during cleaning.` : 'No major data quality issues were found.'}`,
    keyFindings: keyFindings.length > 0 ? keyFindings : ['Dataset loaded and cleaned successfully'],
    nextSteps: [
      { action: 'Address data gaps', detail: issues.length > 0 ? `Review the ${issues.length} issues found during cleaning to ensure data integrity` : 'Your data looks complete — validate with your source system to confirm' },
      { action: 'Segment your data', detail: textCols.length > 0 ? `Use the "${textCols[0]}" column to break down performance across different segments` : 'Add categorical columns to enable deeper segmentation' },
      { action: 'Track key metrics over time', detail: numericCols.length > 0 ? `Monitor ${numericCols[0]} as a primary KPI and set targets relative to the current mean of ${stats[numericCols[0]]?.mean}` : 'Add a date column to enable trend analysis' }
    ],
    dataQuality: issues.length === 0 ? 'Good — no missing values or duplicates detected' : `Issues found: ${issues.join('; ')}. These were automatically cleaned.`
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
