// acquisition.js
// Ported from acquisition.py — fetches latest emails from Gmail API
 
const { google } = require('googleapis');
 
function getGmailService(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}
 
// Recursively drills into MIME payload to find HTML body
// Mirrors get_body() from acquisition.py
function getBody(payload) {
  if (payload.parts) {
    for (const part of payload.parts) {
      const mime = part.mimeType || '';
 
      // Priority 1: direct HTML part
      if (mime === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
 
      // Priority 2: nested multipart — recurse
      if (part.parts) {
        const deep = getBody(part);
        if (deep) return deep;
      }
    }
 
    // Fallback: plain text if no HTML found
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  } else {
    // Single-part message
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
  }
  return '';
}
 
// Mirrors fetch_latest_emails() from acquisition.py
async function fetchLatestEmails(accessToken, maxResults = 5) {
  const service = getGmailService(accessToken);
 
  const listRes = await service.users.messages.list({
    userId: 'me',
    maxResults,
  });
 
  const messages = listRes.data.messages || [];
  const emailData = [];
 
  for (const msg of messages) {
    const full = await service.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
 
    const payload = full.data.payload || {};
    const headers = payload.headers || [];
 
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
    const sender  = headers.find(h => h.name.toLowerCase() === 'from')?.value  || 'Unknown';
    const date    = headers.find(h => h.name.toLowerCase() === 'date')?.value  || '';
 
    const htmlBody = getBody(payload);
 
    emailData.push({
      id:        msg.id,
      subject,
      sender,
      date,
      snippet:   full.data.snippet || '',
      full_html: htmlBody,
    });
  }
 
  return emailData;
}
 
module.exports = { fetchLatestEmails };