// server.js — PhishGuard.AI Express Backend
 
const express    = require('express');
const cors       = require('cors');
const { fetchLatestEmails } = require('./acquisition');
const { analyzeEmail }      = require('./extraction');
 
const app  = express();
const PORT = 3000;
 
// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
 
// Allow only the Chrome extension to call this server
app.use(cors({
  origin: (origin, cb) => {
    // Chrome extensions have origin like: chrome-extension://<id>
    if (!origin || origin.startsWith('chrome-extension://')) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));
 
// ── Routes ────────────────────────────────────────────────────────────────────
 
// Health check
app.get('/ping', (req, res) => res.json({ status: 'ok', service: 'PhishGuard.AI' }));
 
// POST /fetch-and-analyze
// Body: { accessToken: string, maxResults?: number }
// Fetches latest emails from Gmail, runs phishing analysis on each, returns results
app.post('/fetch-and-analyze', async (req, res) => {
  const { accessToken, maxResults = 5 } = req.body;
 
  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }
 
  try {
    // Step 1: Fetch emails (acquisition.js)
    const emails = await fetchLatestEmails(accessToken, maxResults);
 
    // Step 2: Analyze each email (extraction.js)
    const results = emails.map(analyzeEmail);
 
    // Step 3: Sort by risk score — highest first
    results.sort((a, b) => b.score - a.score);
 
    return res.json({ success: true, count: results.length, results });
 
  } catch (err) {
    console.error('[PhishGuard] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});
 
// POST /analyze-one
// Body: { accessToken: string, emailId: string }
// Fetches and analyzes a single email by Gmail message ID
app.post('/analyze-one', async (req, res) => {
  const { accessToken, emailId } = req.body;
 
  if (!accessToken || !emailId) {
    return res.status(400).json({ error: 'accessToken and emailId are required' });
  }
 
  try {
    const emails  = await fetchLatestEmails(accessToken, 20);
    const target  = emails.find(e => e.id === emailId);
 
    if (!target) return res.status(404).json({ error: 'Email not found' });
 
    const result = analyzeEmail(target);
    return res.json({ success: true, result });
 
  } catch (err) {
    console.error('[PhishGuard] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});
 
// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PhishGuard.AI backend running → http://localhost:${PORT}`);
});