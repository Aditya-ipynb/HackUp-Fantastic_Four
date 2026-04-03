const BACKEND = 'http://localhost:3000';
let accessToken = null;
let currentReport = null;

// Wait for the DOM to load before attaching events
document.addEventListener('DOMContentLoaded', () => {
    // Attach click events to buttons (replaces onclick in HTML)
    document.getElementById('signInBtn').addEventListener('click', signIn);
    document.getElementById('startScanBtn').addEventListener('click', startAnalysis);
    document.getElementById('backToDash').addEventListener('click', () => goTo('v-dash'));
    document.getElementById('backToList').addEventListener('click', () => goTo('v-list'));
    document.getElementById('fullBtn').addEventListener('click', openReport);
});

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function signIn() {
    const errEl = document.getElementById('authErr');
    if (errEl) errEl.textContent = '';
    
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
            if (errEl) errEl.textContent = 'Sign-in failed. Try again.';
            return;
        }
        accessToken = token;
        goTo('v-dash');
    });
}

// ── Fetch + Analyze ───────────────────────────────────────────────────────────
async function startAnalysis() {
    goTo('v-loading');

    const fill = document.getElementById('progFill');
    fill.style.transition = 'width 3s ease-out';
    setTimeout(() => fill.style.width = '90%', 50);

    let dots = 0;
    const dotTimer = setInterval(() => {
        dots = (dots + 1) % 4;
        document.getElementById('dnaText').textContent = 'ANALYZING DNA' + '.'.repeat(dots);
    }, 350);

    try {
        const res = await fetch(`${BACKEND}/fetch-and-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, maxResults: 5 }),
        });

        const data = await res.json();
        clearInterval(dotTimer);
        fill.style.width = '100%';

        if (!data.success) throw new Error(data.error || 'Unknown error');

        setTimeout(() => {
            fill.style.transition = 'none';
            fill.style.width = '0';
            renderEmailList(data.results);
            goTo('v-list');
        }, 400);

    } catch (err) {
        clearInterval(dotTimer);
        fill.style.width = '0';
        document.getElementById('statusTxt').textContent = '✕ Error: ' + err.message;
        goTo('v-dash');
    }
}

// ── Email List ────────────────────────────────────────────────────────────────
function renderEmailList(results) {
    const list = document.getElementById('emailList');
    list.innerHTML = '';

    results.forEach(r => {
        const color = r.score >= 70 ? '#ff2d55' : r.score >= 40 ? '#ffd60a' : '#30d158';
        const bg    = r.score >= 70 ? '#ff2d5511' : r.score >= 40 ? '#ffd60a11' : '#30d15811';
        const border= r.score >= 70 ? '#ff2d5533' : r.score >= 40 ? '#ffd60a33' : '#30d15833';

        const card = document.createElement('div');
        card.className = 'email-card';
        card.style.borderColor = border;
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
                <div class="email-score" style="color:${color}">${r.score}%</div>
                <div style="flex:1;min-width:0">
                    <div class="email-subject">${escHtml(r.subject)}</div>
                    <div class="email-sender">${escHtml(r.sender)}</div>
                </div>
                <div class="threat-pill" style="background:${bg};border:1px solid ${border};color:${color}">${r.threatLevel}</div>
            </div>`;
        
        // This is fine for CSP because it's a direct JS reference, not a string in HTML
        card.addEventListener('click', () => showReport(r));
        list.appendChild(card);
    });
}

// ── Report ────────────────────────────────────────────────────────────────────
function showReport(r) {
    currentReport = r;
    const color = r.score >= 70 ? '#ff2d55' : r.score >= 40 ? '#ffd60a' : '#30d158';
    const bg    = r.score >= 70 ? '#ff2d5508' : r.score >= 40 ? '#ffd60a08' : '#30d15808';
    const border= r.score >= 70 ? '#ff2d5533' : r.score >= 40 ? '#ffd60a33' : '#30d15833';

    document.getElementById('g1').setAttribute('stop-color', color);
    document.getElementById('g2').setAttribute('stop-color', color);
    document.getElementById('gaugeScore').setAttribute('fill', color);
    document.getElementById('gaugeDot').setAttribute('fill', color);

    const badge = document.getElementById('riskBadge');
    badge.textContent = (r.score >= 70 ? '⚠ CRITICAL' : r.score >= 40 ? '▲ MODERATE' : '✓ SAFE') + ' THREAT';
    badge.style.cssText = `background:${bg};border:1px solid ${border};color:${color};display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;font-size:9px;font-weight:700;letter-spacing:.15em`;

    document.getElementById('alertCard').style.cssText = `width:100%;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:5px;background:${bg};border:1px solid ${border}`;
    document.getElementById('alertHead').style.color = color;
    document.getElementById('alertHead').textContent = r.threatLevel + ' — ' + r.findings[0];

    const fl = document.getElementById('findingsList');
    fl.innerHTML = r.findings.slice(1).map(f =>
        `<div class="finding-item"><div class="finding-dot" style="background:${color}"></div>${escHtml(f)}</div>`
    ).join('');

    document.getElementById('rFrom').textContent = r.sender;
    document.getElementById('rFrom').style.color = r.score >= 70 ? '#ff2d55' : '#64748b';
    document.getElementById('rSubj').textContent = r.subject;

    const fb = document.getElementById('fullBtn');
    fb.style.cssText = `width:100%;padding:9px;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:.12em;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;background:none;font-family:'JetBrains Mono',monospace;transition:all .2s;border:1px solid ${border};color:${color}`;

    goTo('v-report');
    animateGauge(r.score, color);
}

// ── Gauge Animation ───────────────────────────────────────────────────────────
function animateGauge(target, color) {
    const scoreEl = document.getElementById('gaugeScore');
    const arcEl   = document.getElementById('gaugeArc');
    const dotEl   = document.getElementById('gaugeDot');
    const cx = 100, cy = 95, R = 72;

    function polarXY(angle) {
        return { x: cx + R * Math.cos(angle), y: cy - R * Math.sin(angle) };
    }

    const start = performance.now();
    (function step(now) {
        const p     = Math.min((now - start) / 1200, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const pct   = eased * target;

        scoreEl.textContent = Math.round(pct) + '%';

        const angle    = Math.PI - (pct / 100) * Math.PI;
        const tip      = polarXY(angle);
        const bigArc   = pct > 50 ? 1 : 0;
        const s        = polarXY(Math.PI);
        arcEl.setAttribute('d', `M ${s.x} ${s.y} A ${R} ${R} 0 ${bigArc} 1 ${tip.x} ${tip.y}`);
        dotEl.setAttribute('cx', tip.x);
        dotEl.setAttribute('cy', tip.y);

        if (p < 1) requestAnimationFrame(step);
    })(start);
}

// ── Full Report ───────────────────────────────────────────────────────────────
function openReport() {
    if (!currentReport) return;
    chrome.storage.local.set({ lastReport: currentReport }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('full_report.html') });
    });
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}