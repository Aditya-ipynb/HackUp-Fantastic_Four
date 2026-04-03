// extraction.js
// Ported from extraction.py — extracts phishing features and computes a risk score
 
const cheerio = require('cheerio');
const { URL } = require('url');
 
const SHORTENERS  = ['bit.ly', 'goo.gl', 't.co', 'tinyurl.com', 'is.gd', 'ow.ly', 'buff.ly'];
const BRANDS      = ['google', 'netflix', 'paypal', 'amazon', 'microsoft', 'upi', 'paytm', 'apple', 'facebook'];
const URGENCY_KW  = ['urgent', 'suspend', 'restricted', 'unauthorized', 'action required', 'login now', 'verify', 'security alert'];
 
// Mirrors extract_ml_features() from extraction.py
function extractFeatures(mailObj) {
  let html = mailObj.full_html || '';
  if (!html) html = `<html><body>${mailObj.snippet || ''}</body></html>`;
 
  const $ = cheerio.load(html);
  const textContent = $.text().toLowerCase();
 
  const features = {
    url_count:           0,
    ip_as_url:           0,
    shortened_url:       0,
    link_mismatch:       0,
    urgency_score:       0,
    brand_impersonation: 0,
    has_form:            $('form').length > 0 ? 1 : 0,
    has_password_input:  $('input[type="password"]').length > 0 ? 1 : 0,
  };
 
  // ── URL Analysis (mirrors the for-loop in extraction.py) ──────────────────
  const links = $('a[href]').toArray();
  features.url_count = links.length;
 
  for (const el of links) {
    const href      = $(el).attr('href') || '';
    const linkText  = $(el).text().toLowerCase();
    let domain      = '';
 
    try {
      domain = new URL(href).hostname.toLowerCase();
    } catch {
      // relative or malformed URL — skip domain checks
    }
 
    // IP-based URL
    if (/\d+\.\d+\.\d+\.\d+/.test(domain)) features.ip_as_url = 1;
 
    // Shortened URL
    if (SHORTENERS.some(s => domain.includes(s))) features.shortened_url += 1;
 
    // Link mismatch: anchor text mentions a brand but href domain does not
    if (
      BRANDS.some(b => linkText.includes(b)) &&
      domain &&
      !BRANDS.some(b => domain.includes(b))
    ) {
      features.link_mismatch += 1;
    }
  }
 
  // ── NLP Features ──────────────────────────────────────────────────────────
  features.urgency_score       = URGENCY_KW.filter(w => textContent.includes(w)).length;
  features.brand_impersonation = BRANDS.filter(b => textContent.includes(b)).length;
 
  return features;
}
 
// ── Risk Score Calculator ─────────────────────────────────────────────────────
// Weighted scoring that maps features → 0–100 phishing risk %
// Weights inspired by the comments in extraction.py (URL 25%, NLP 20%, Form 15%)
function computeRiskScore(features) {
  let score = 0;
 
  // URL signals (max ~40 pts)
  if (features.ip_as_url)               score += 25;
  if (features.link_mismatch > 0)       score += 20;
  if (features.shortened_url > 0)       score += 10;
  if (features.url_count > 5)           score += 5;
 
  // NLP signals (max ~30 pts)
  score += Math.min(features.urgency_score * 7, 21);       // up to 3 hits = 21pts
  score += Math.min(features.brand_impersonation * 3, 9);  // up to 3 brands = 9pts
 
  // Form / credential harvesting signals (max ~15 pts)
  if (features.has_form)           score += 8;
  if (features.has_password_input) score += 7;
 
  return Math.min(Math.round(score), 100);
}
 
// ── Threat Level ──────────────────────────────────────────────────────────────
function getThreatLevel(score) {
  if (score >= 70) return 'CRITICAL';
  if (score >= 40) return 'MODERATE';
  return 'SAFE';
}
 
// ── Human-readable findings ───────────────────────────────────────────────────
function buildFindings(features, mailObj) {
  const findings = [];
 
  if (features.ip_as_url)
    findings.push('IP address used as URL — hides real destination');
  if (features.link_mismatch > 0)
    findings.push(`${features.link_mismatch} link(s) mismatch brand text vs actual domain`);
  if (features.shortened_url > 0)
    findings.push(`${features.shortened_url} shortened URL(s) detected — destination hidden`);
  if (features.urgency_score > 0)
    findings.push(`${features.urgency_score} urgency keyword(s) found (e.g. "verify", "suspend")`);
  if (features.brand_impersonation > 0)
    findings.push(`Impersonates ${features.brand_impersonation} known brand(s)`);
  if (features.has_form)
    findings.push('Contains an HTML form — possible credential harvesting');
  if (features.has_password_input)
    findings.push('Password input field detected in email body');
 
  return findings.length > 0 ? findings : ['No major indicators found'];
}
 
// ── Main export ───────────────────────────────────────────────────────────────
function analyzeEmail(mailObj) {
  const features    = extractFeatures(mailObj);
  const score       = computeRiskScore(features);
  const threatLevel = getThreatLevel(score);
  const findings    = buildFindings(features, mailObj);
 
  return {
    id:           mailObj.id,
    subject:      mailObj.subject,
    sender:       mailObj.sender,
    date:         mailObj.date,
    snippet:      mailObj.snippet,
    score,
    threatLevel,
    findings,
    features,     // raw features — useful for full forensic report
  };
}
 
module.exports = { analyzeEmail };