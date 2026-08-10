/* ══════════════════════════════════════════
   Pillar — Recruiter Dashboard JS
   Enterprise Premium — Card Grid + Score Rings + Tabs
   ══════════════════════════════════════════ */

window.toggleSidebar = function() {
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
};

window.togglePhase = function(hdrElement) {
  const section = hdrElement.closest('.rpt-section');
  const content = section?.querySelector('.rpt-phase-content');
  if (!section || !content) return;

  if (section.classList.contains('collapsed')) {
    // Apri
    section.classList.remove('collapsed');
    content.style.maxHeight = content.scrollHeight + 'px';
    setTimeout(() => {
      if (!section.classList.contains('collapsed')) {
        content.style.maxHeight = 'none';
      }
    }, 350);
  } else {
    // Chiudi
    content.style.maxHeight = content.scrollHeight + 'px';
    // Forza reflow per far partire l'animazione da un valore noto
    void content.offsetHeight;
    section.classList.add('collapsed');
    content.style.maxHeight = '0px';
  }
};

const POLL_INTERVAL = 5000;
let sessions = [];
let activeSessionId = null;

// Filter state
let filterSearch = "";
let filterScore = "all";
let filterRec = "all";
let activeStatusFilters = [];
let activeAIFilters = [];
let sortOption = "score-desc";

// Pagination
const PAGE_SIZE = 15;
let currentPage = 1;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // Bind filters
  document.getElementById('search-input').addEventListener('input', (e) => {
    filterSearch = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderOverview();
  });
  document.getElementById('filter-score').addEventListener('change', (e) => {
    filterScore = e.target.value;
    currentPage = 1;
    renderOverview();
  });
  document.getElementById('filter-rec').addEventListener('change', (e) => {
    filterRec = e.target.value;
    currentPage = 1;
    renderOverview();
  });
  // Custom Sort Dropdown Logic
  const sortDropdown = document.getElementById('sort-dropdown');
  const sortToggle = document.getElementById('sort-toggle');
  const sortItems = document.querySelectorAll('.custom-dropdown-item');

  sortToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sortDropdown.classList.toggle('open');
  });

  sortItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      sortItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      sortToggle.textContent = item.textContent;
      sortOption = item.dataset.value;
      sortDropdown.classList.remove('open');
      currentPage = 1;
      renderOverview();
    });
  });

  document.addEventListener('click', (e) => {
    if (sortDropdown && sortDropdown.classList.contains('open') && !sortDropdown.contains(e.target)) {
      sortDropdown.classList.remove('open');
    }
    const filterDropdown = document.getElementById('filter-dropdown');
    if (filterDropdown && filterDropdown.classList.contains('open') && !filterDropdown.contains(e.target)) {
      filterDropdown.classList.remove('open');
    }
  });

  const filterDropdown = document.getElementById('filter-dropdown');
  const filterToggle = document.getElementById('filter-toggle');
  if (filterToggle && filterDropdown) {
    filterToggle.addEventListener('click', () => {
      filterDropdown.classList.toggle('open');
    });
  }

  document.querySelectorAll('#filter-menu input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      activeStatusFilters = Array.from(document.querySelectorAll('#filter-menu input[data-filter-type="status"]:checked')).map(cb => cb.value);
      activeAIFilters = Array.from(document.querySelectorAll('#filter-menu input[data-filter-type="ai"]:checked')).map(cb => cb.value);
      
      const count = activeStatusFilters.length + activeAIFilters.length;
      const countBadge = document.getElementById('filter-count');
      if (count > 0) {
        countBadge.style.display = 'inline-block';
        countBadge.textContent = `(${count})`;
        filterToggle.classList.add('active');
      } else {
        countBadge.style.display = 'none';
        filterToggle.classList.remove('active');
      }
      
      currentPage = 1;
      renderOverview();
    });
  });

  // Bind tabs
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Bind notes autosave
  const notesTextarea = document.getElementById('detail-notes');
  let autosaveTimeout = null;
  notesTextarea.addEventListener('input', () => {
    document.getElementById('notes-status').textContent = "Salvataggio in corso...";
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(saveNotes, 1000);
  });

  // Bind shortlist button (if present — may be rendered dynamically)
  const shortlistBtn = document.getElementById('detail-btn-shortlist');
  if (shortlistBtn) {
    shortlistBtn.addEventListener('click', async () => {
      if (!activeSessionId) return;
      try {
        const res = await fetch(`/api/session/${activeSessionId}/shortlist`, { method: 'POST' });
        if (!res.ok) return;
        const data = await res.json();
        updateShortlistButtonState(data.shortlisted);
        const localSess = sessions.find(s => s.id === activeSessionId);
        if (localSess) localSess.shortlisted = data.shortlisted;
        updateKPIs();
      } catch (e) {
        console.error("Shortlist detail error:", e);
      }
    });
  }

  // Start polling
  pollSessions();
  setInterval(pollSessions, POLL_INTERVAL);
});

// ── TABS ──
function switchTab(tabId) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const tabBtn = document.querySelector(`.detail-tab[data-tab="${tabId}"]`);
  const tabContent = document.getElementById(tabId);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) {
    tabContent.classList.add('active');
    // Re-trigger animation
    tabContent.style.animation = 'none';
    tabContent.offsetHeight; // force reflow
    tabContent.style.animation = '';
  }
}

// ── FETCH DATA ──
async function pollSessions() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    const data = await res.json();
    sessions = data.sessions || [];
    updateKPIs();
    renderOverview();
  } catch (e) {
    console.warn('Network poll error:', e.message);
  }
}

// ── VIEW SWITCHING ──
function showOverview() {
  activeSessionId = null;
  document.getElementById('app-sidebar').classList.remove('hidden');
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-overview').style.display = 'block';
  document.getElementById('db-breadcrumb-current').textContent = "Dashboard";
  // Re-trigger animation
  const section = document.getElementById('view-overview');
  section.style.animation = 'none';
  section.offsetHeight;
  section.style.animation = '';
  pollSessions();
}

async function showDetail(id) {
  activeSessionId = id;
  document.getElementById('app-sidebar').classList.add('hidden');
  document.getElementById('view-overview').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';



  try {
    const res = await fetch(`/api/session/${id}`);
    if (!res.ok) throw new Error("Session not found");
    const session = await res.json();
    renderDetail(session);

    // Re-trigger animation
    const section = document.getElementById('view-detail');
    section.style.animation = 'none';
    section.offsetHeight;
    section.style.animation = '';
  } catch (e) {
    console.error("Error loading detail:", e);
    showToast("Impossibile caricare il profilo del candidato.");
    showOverview();
  }
}

// ── KPI CALCULATIONS ──
function updateKPIs() {
  const completed = sessions.length;
  animateCounter('kpi-completed', completed);

  // Weekly trend for completed
  document.getElementById('kpi-completed-trend').textContent = completed === 1 ? '↑ +1 nuovo' : `↑ +${completed} nuovi`;

  if (completed === 0) {
    document.getElementById('kpi-strong-hire-rate').textContent = '0%';
    document.getElementById('kpi-strong-hire-detail').textContent = '0 candidati su 0';
    document.getElementById('kpi-avg-score').textContent = '0%';
    document.getElementById('kpi-avg-score-detail').textContent = 'Su 0 candidati valutati';
    document.getElementById('kpi-avg-time').textContent = '00:00';
    document.getElementById('kpi-avg-time-detail').textContent = 'Su 0 simulazioni completate';
    return;
  }

  // Strong Hire Rate
  const strongHireCount = sessions.filter(s => {
    const rec = (s.evaluation?.recommendation || '').trim().toLowerCase();
    return rec === 'strong hire';
  }).length;
  const strongHireRate = Math.round((strongHireCount / completed) * 100);
  animateCounter('kpi-strong-hire-rate', strongHireRate, '%');
  document.getElementById('kpi-strong-hire-detail').textContent = `${strongHireCount} candidat${strongHireCount === 1 ? 'o' : 'i'} su ${completed}`;
  document.getElementById('kpi-strong-hire-trend').textContent = strongHireCount > 0 ? `↑ +${strongHireCount} Strong Hire` : '0 Strong Hire';

  // Average Overall Score
  const avgScore = Math.round(sessions.reduce((acc, curr) => acc + (curr.evaluation?.overallScore || 0), 0) / completed);
  animateCounter('kpi-avg-score', avgScore, '%');
  document.getElementById('kpi-avg-score-detail').textContent = `Su ${completed} candidat${completed === 1 ? 'o' : 'i'} valutat${completed === 1 ? 'o' : 'i'}`;

  // Average Time
  const totalSeconds = sessions.reduce((acc, curr) => acc + (curr.callDuration || 0), 0);
  const avgSeconds = Math.round(totalSeconds / completed);
  document.getElementById('kpi-avg-time').textContent = formatCallDuration(avgSeconds);
  document.getElementById('kpi-avg-time-detail').textContent = `Su ${completed} simulazion${completed === 1 ? 'e' : 'i'} completat${completed === 1 ? 'a' : 'e'}`;
}

// ── COUNTER ANIMATION ──
function animateCounter(elementId, target, suffix = '') {
  const el = document.getElementById(elementId);
  const start = parseInt(el.textContent) || 0;
  if (start === target) { el.textContent = `${target}${suffix}`; return; }

  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (target - start) * eased);
    el.textContent = `${current}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── SCORE RING SVG ──
function createScoreRingSVG(score, size, strokeWidth) {
  const r = (size / 2) - strokeWidth - 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-bg" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${strokeWidth}" transform="rotate(-90 ${size/2} ${size/2})"/>
      <circle class="ring-fill" cx="${size/2}" cy="${size/2}" r="${r}" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size/2} ${size/2})" style="animation: ringDraw 0.8s var(--db-ease) both;"/>
    </svg>
  `;
}

function getScoreColor(score) {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#2563eb';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

// ── OVERVIEW RENDER (ATS Table) ──
function renderOverview() {
  const tbody = document.getElementById('ats-tbody');
  const emptyState = document.getElementById('grid-empty-state');
  const tableContainer = document.getElementById('table-container');

  let filtered = sessions.filter(s => {
    const name = `${s.candidate.firstName || ''} ${s.candidate.lastName || ''}`.toLowerCase();
    const email = (s.candidate.email || '').toLowerCase();
    if (filterSearch && !name.includes(filterSearch) && !email.includes(filterSearch)) return false;
    if (filterScore !== 'all') {
      const minScore = parseInt(filterScore);
      if ((s.evaluation?.overallScore || 0) < minScore) return false;
    }
    if (filterRec !== 'all') {
      const rec = (s.evaluation?.recommendation || 'Review').trim().toLowerCase().replace(' ', '-');
      if (filterRec === 'review') {
        if (rec !== 'review' && rec !== 'maybe') return false;
      } else if (filterRec === 'no-hire') {
        if (rec !== 'no-hire' && rec !== 'reject' && rec !== 'rejected') return false;
      } else {
        if (rec !== filterRec) return false;
      }
    }
    if (activeStatusFilters.length > 0) {
      let currentStatus = "pending";
      if (s.shortlisted) currentStatus = "shortlisted";
      else if (s.rejected) currentStatus = "rejected";
      else if (s.evaluation && s.evaluation.overallScore > 0) currentStatus = "completed";
      
      if (!activeStatusFilters.includes(currentStatus)) return false;
    }

    if (activeAIFilters.length > 0) {
      let rec = (s.evaluation?.recommendation || 'Maybe').trim();
      if (rec === 'Review' || rec === 'Da Valutare') rec = 'Maybe';
      if (!activeAIFilters.includes(rec)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortOption === 'score-desc') return (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0);
    if (sortOption === 'score-asc') return (a.evaluation?.overallScore || 0) - (b.evaluation?.overallScore || 0);
    if (sortOption === 'date-desc') return new Date(b.savedAt) - new Date(a.savedAt);
    if (sortOption === 'date-asc') return new Date(a.savedAt) - new Date(b.savedAt);
    if (sortOption === 'name-asc') {
      const nameA = `${a.candidate.firstName} ${a.candidate.lastName}`.toLowerCase();
      const nameB = `${b.candidate.firstName} ${b.candidate.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    }
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    tableContainer.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  tableContainer.style.display = 'block';
  emptyState.style.display = 'none';

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (currentPage > totalPages) currentPage = totalPages;
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  // Render rows
  tbody.innerHTML = pageItems.map((s, idx) => {
    const fullName = `${s.candidate.firstName} ${s.candidate.lastName}`;
    const initials = (s.candidate.firstName.charAt(0) + s.candidate.lastName.charAt(0)).toUpperCase();
    const durationStr = formatCallDuration(s.callDuration);
    const ev = s.evaluation || { overallScore: 50, discoveryScore: 50, qualificationScore: 50, handoffScore: 50, aiCommunicationScore: 50, level: 'Average', badgeClass: 'badge-average', recommendation: 'Maybe', strengths: [], improvements: [] };
    const scoreClass = getScoreClass(ev.overallScore);

    // Recommendation badge
    let recBadgeHtml = "";
    const rec = (ev.recommendation || "Review").trim().toLowerCase().replace(' ', '-');
    if (rec === 'strong-hire') {
      recBadgeHtml = `<span class="rec-badge strong-hire"><span class="rec-dot"></span>Strong Hire</span>`;
    } else if (rec === 'hire') {
      recBadgeHtml = `<span class="rec-badge hire"><span class="rec-dot"></span>Hire</span>`;
    } else if (rec === 'no-hire' || rec === 'reject' || rec === 'rejected') {
      recBadgeHtml = `<span class="rec-badge no-hire"><span class="rec-dot"></span>No Hire</span>`;
    } else {
      recBadgeHtml = `<span class="rec-badge maybe"><span class="rec-dot"></span>Review</span>`;
    }

    // Top Strength & Biggest Weakness — derived from phase scores
    const phases = [
      { label: 'Chiamata Discovery', score: ev.discoveryScore || 0 },
      { label: 'Prioritizzazione CRM', score: ev.crmScore || 0 },
      { label: 'Qualificazione', score: ev.qualificationScore || 0 },
      { label: 'Handoff AE', score: ev.handoffScore || 0 },
    ];
    phases.sort((a, b) => b.score - a.score);
    const topStrength = phases[0].label;
    const biggestWeakness = phases[phases.length - 1].label;

    // Status pill — recruiting-oriented
    let status = "In Attesa";
    let statusClass = "pending";
    if (s.shortlisted) {
      status = "Shortlisted";
      statusClass = "interview";
    } else if (ev.overallScore < 50) {
      status = "Scartato";
      statusClass = "rejected";
    } else if (s.internalNotes && s.internalNotes.trim().length > 0) {
      status = "Valutato";
      statusClass = "completed";
    }
    const statusHtml = `<span class="status-pill ${statusClass}"><span class="status-dot"></span>${status}</span>`;

    return `
      <tr onclick="showDetail('${s.id}')" style="animation-delay: ${idx * 0.02}s">
        <td><div class="td-avatar">${initials}</div></td>
        <td>
          <div class="td-name-wrap">
            <span class="td-name">${escapeHtml(fullName)}</span>
            <span class="td-email">${escapeHtml(s.candidate.email)}</span>
          </div>
        </td>
        <td><span class="overall-text ${scoreClass}">${ev.overallScore}%</span></td>
        <td>${recBadgeHtml}</td>
        <td><span class="badge-strength"><span class="badge-dot green"></span>${escapeHtml(topStrength)}</span></td>
        <td><span class="badge-weakness"><span class="badge-dot red"></span>${escapeHtml(biggestWeakness)}</span></td>
        <td><span class="td-tempo">${durationStr}</span></td>
        <td>${statusHtml}</td>
        <td style="text-align: right;"><button class="btn-row-action" onclick="event.stopPropagation(); showDetail('${s.id}')">Apri Report</button></td>
      </tr>
    `;
  }).join('');

  // Render pagination
  renderPagination(totalPages);
}

// ── PAGINATION ──
function renderPagination(totalPages) {
  const paginationBar = document.getElementById('pagination-bar');
  const paginationPages = document.getElementById('pagination-pages');
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');

  if (totalPages <= 1) {
    paginationBar.style.display = 'none';
    return;
  }

  paginationBar.style.display = 'flex';
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;

  // Smart page numbers
  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  paginationPages.innerHTML = pages.map(p => {
    if (p === '...') return '<span class="pagination-ellipsis">…</span>';
    return `<button class="pagination-page ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
  }).join('');
}

function changePage(delta) {
  currentPage += delta;
  renderOverview();
  document.getElementById('table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goToPage(page) {
  currentPage = page;
  renderOverview();
  document.getElementById('table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}



// ── DETAIL RENDER v6 — Evidence-first Candidate Base Report ──
window.playDemoAudio = function(btn) {
  if (!btn) btn = document.querySelector('.rpt-player-btn');
  const bars = document.querySelectorAll('.rpt-wave-bar');
  if (!bars.length || !btn) return;
  
  const timeDisplay = document.querySelector('.rpt-player-time');
  const playIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  const pauseIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  
  if (!window.demoAudioElement && window.currentAudioUrl) {
    window.demoAudioElement = new Audio(window.currentAudioUrl);
    window.demoAudioElement.onended = () => {
      window.demoAudioPlaying = false;
      btn.innerHTML = playIcon;
      if (timeDisplay) timeDisplay.textContent = `${formatCallDuration(window.currentCallDuration)} / ${formatCallDuration(window.currentCallDuration)}`;
      bars.forEach(b => b.setAttribute('fill', '#cbd5e1')); // reset
      cancelAnimationFrame(window.demoAudioAnimFrame);
    };
  }

  if (!window.demoAudioElement) {
    alert("Nessun audio reale salvato per questa sessione. Solo le nuove chiamate avranno l'audio registrato.");
    return;
  }
  
  window.demoAudioPlaying = !window.demoAudioPlaying;
  
  if (window.demoAudioPlaying) {
    btn.innerHTML = pauseIcon;
    window.demoAudioElement.play();
    
    function updateProgress() {
      if (!window.demoAudioPlaying) return;
      
      const currentTime = window.demoAudioElement.currentTime;
      const duration = window.demoAudioElement.duration || window.currentCallDuration || 60;
      const percent = Math.min(1, currentTime / duration);
      
      const activeBars = Math.floor(percent * bars.length);
      for (let i = 0; i < bars.length; i++) {
        bars[i].setAttribute('fill', i < activeBars ? '#2563eb' : '#cbd5e1');
      }
      
      if (timeDisplay) timeDisplay.textContent = `${formatCallDuration(currentTime)} / ${formatCallDuration(duration)}`;
      window.demoAudioAnimFrame = requestAnimationFrame(updateProgress);
    }
    window.demoAudioAnimFrame = requestAnimationFrame(updateProgress);
    
  } else {
    btn.innerHTML = playIcon;
    window.demoAudioElement.pause();
    cancelAnimationFrame(window.demoAudioAnimFrame);
  }
};

function renderDetail(s) {
  const ev = s.evaluation;
  const cand = s.candidate;
  const an = s.analytics || {};
  const fullName = `${cand.firstName} ${cand.lastName}`;
  const initials = (cand.firstName.charAt(0) + cand.lastName.charAt(0)).toUpperCase();
  const dateStr = new Date(s.savedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const scoreClass = getScoreClass(ev.overallScore);
  const recClass = ev.recommendation.toLowerCase().replace(/ /g, '-');
  const callDur = formatCallDuration(an.call?.callDuration || s.callDuration || 0);
  const ci = ev.conversationInsights || {};
  const qual = an.qualification || {};
  const prospectName = an.call?.prospectName || 'Prospect';
  const crm = an.crm || {};
  const crmScore = ev.crmScore || 65;
  const callScore = ev.discoveryScore || 50;
  const qualScore = ev.qualificationScore || 50;
  const handoffScore = ev.handoffScore || 50;

  // ── HEADER (top bar is in the back button area) ──
  const totalTimeMins = an.totalTime ? Math.round(an.totalTime / 60000) : null;
  const savedDate = new Date(s.savedAt);
  const dateTimeStr = savedDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) + ' — ' + savedDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // Render the top bar
  document.querySelector('.rpt-back').innerHTML = `
    <div class="rpt-topbar">
      <div class="rpt-topbar-left">
        <button class="back-btn" onclick="showOverview()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Torna alla dashboard
        </button>
      </div>
    </div>
  `;

  document.getElementById('rpt-header').innerHTML = `

    <!-- Row 1: Identity · Metadata · Score -->
    <div class="rpt-hdr-main">

      <div class="rpt-hdr-identity">
        <div class="rpt-hdr-avatar">${initials}</div>
        <div class="rpt-hdr-text">
          <div class="rpt-hdr-name">${escapeHtml(fullName)}</div>
          <div class="rpt-hdr-email">${escapeHtml(cand.email || '—')}</div>
        </div>
      </div>

      <div class="rpt-hdr-sep"></div>

      <div class="rpt-hdr-meta">
        <div class="rpt-hdr-kv">
          <span class="rpt-hdr-kv-label">Data</span>
          <span class="rpt-hdr-kv-value">${dateTimeStr}</span>
        </div>
        <div class="rpt-hdr-kv">
          <span class="rpt-hdr-kv-label">Durata</span>
          <span class="rpt-hdr-kv-value">${totalTimeMins ? totalTimeMins + ' min' : callDur}</span>
        </div>
        <div class="rpt-hdr-kv">
          <span class="rpt-hdr-kv-label">Simulazione</span>
          <span class="rpt-hdr-kv-value">SDR Inbound Intern</span>
        </div>
      </div>

      <div class="rpt-hdr-score-block">
        <div class="rpt-hdr-score-num ${scoreClass}">${ev.overallScore}</div>
        <div class="rpt-hdr-score-detail">
          <span class="rpt-hdr-score-of">/ 100</span>
          <span class="rpt-hdr-score-badge ${recClass}"><span class="dot"></span>${ev.recommendation}</span>
        </div>
      </div>

    </div>

    <!-- Row 2: AI Summary -->
    <div class="rpt-hdr-ai">
      <div class="rpt-hdr-ai-label">
        <span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>
        Sintesi Alpha AI
      </div>
      <div class="rpt-hdr-ai-text">${escapeHtml(ev.recExplain || '')}</div>
    </div>  `;

  // ── NAVIGATION ── (Removed per request)
  const navEl = document.getElementById('rpt-nav');
  if (navEl) {
    navEl.innerHTML = '';
    navEl.style.display = 'none';
  }

  // ── SNAPSHOT REMOVED — content is in header AI summary ──
  document.getElementById('rpt-snapshot').style.display = 'none';

  // ══════════════════════════════════════════
  // PHASE 1: CRM PRIORITIZATION
  // ══════════════════════════════════════════
  const crmClass = getScoreClass(crmScore);
  const crmLevel = getScoreLevel(crmScore);
  const motivationText = crm.priorityMotivation || an.builderMindset?.text || '';
  const crmLeads = crm.leads || [];
  const crmTimeSpent = crm.timeSpent ? formatCallDuration(crm.timeSpent) : null;
  const crmAiText = crm.aiAssessment || getPhaseComment('Prioritizzazione CRM', crmScore);

  // Lead metadata fallback for sessions without rich lead data
  const leadMetaFallback = {
    "Edilizia Marchetti Srl": { employees: 45, jobSites: 12, lastActivity: "Form demo compilato", demoRequested: true },
    "Costruzioni Ferraro & Figli": { employees: 28, jobSites: 7, lastActivity: "Visita pricing", demoRequested: false },
    "GreenBuild SpA": { employees: 62, jobSites: 15, lastActivity: "Download brochure", demoRequested: false },
    "Studio Tecnico Parisi": { employees: 8, jobSites: 3, lastActivity: "Nessuna attività recente", demoRequested: false },
    "Rossi Infrastrutture Srl": { employees: 120, jobSites: 22, lastActivity: "Nessuna attività recente", demoRequested: false }
  };

  // Word count for motivation
  const motivationWords = motivationText ? motivationText.trim().split(/\s+/).length : 0;

  // Map slugs to full names
  const leadNamesMap = {
    'marchetti': 'Edilizia Marchetti Srl',
    'ferraro': 'Costruzioni Ferraro & Figli',
    'greenbuild': 'GreenBuild SpA',
    'parisi': 'Studio Tecnico Parisi',
    'rossi': 'Rossi Infrastrutture Srl'
  };

  const leadsHtml = (crm.priorityOrder || []).map((leadId, i) => {
    const leadFullName = leadNamesMap[leadId] || leadId;
    const leadData = crmLeads.find(l => l.id === leadId || l.name === leadFullName) || leadMetaFallback[leadFullName] || {};
    const isTop = i === 0;
    return `
      <div class="crm-lead${isTop ? ' crm-lead--top' : ''}">
        <span class="crm-lead-num${isTop ? ' crm-lead-num--top' : ''}">${i + 1}</span>
        <div class="crm-lead-content">
          <div class="crm-lead-row-main">
            <span class="crm-lead-name">${escapeHtml(leadFullName)}</span>
            ${isTop ? '<span class="crm-lead-badge">Lead prioritario</span>' : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('rpt-phase-crm').innerHTML = `
    <div class="rpt-phase-hdr" onclick="togglePhase(this)">
      <div class="rpt-phase-hdr-left">
        <span class="rpt-phase-num">1</span>
        <span class="rpt-phase-title">Prioritizzazione CRM</span>
      </div>
      <div class="rpt-phase-hdr-right">
        <div class="rpt-phase-score-pill ${crmClass}"><span class="pill-dot"></span>${crmScore} / 100</div>
        <svg class="rpt-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
    <div class="rpt-phase-content">
      <div class="rpt-phase-content-inner">
    <div class="rpt-phase-desc">In questa fase il candidato doveva analizzare 5 lead inbound, ordinarli per priorità commerciale e motivare la posizione assegnata a ciascun lead.</div>

    <div class="crm-body">

      <div class="crm-col crm-col--left">
        <div class="crm-col-hdr">
          <div class="crm-col-title">Classifica Lead</div>
          <div class="crm-col-sub">Dal più al meno prioritario</div>
        </div>
        <div class="crm-lead-list">${leadsHtml}</div>
      </div>

      <div class="crm-sep"></div>

      <div class="crm-col crm-col--right">
        <div class="crm-col-hdr">
          <div class="crm-col-title">Motivazione del candidato</div>
          <div class="crm-col-sub">Il candidato ha scritto ${motivationWords} parole.</div>
        </div>
        <div class="crm-doc" style="padding: 16px 20px;">
          <div class="rpt-slack-msg-hdr" style="margin-bottom: 8px;">
            <div class="rpt-slack-avatar avatar-sdr" style="margin-right: 8px; margin-top: 0;">${initials}</div>
            <span class="rpt-slack-msg-name">${escapeHtml(fullName)}</span>
            <span class="rpt-slack-msg-role avatar-sdr">SDR Inbound Intern</span>
          </div>
          <div class="rpt-slack-msg-text" style="max-width: none;">${escapeHtml(motivationText)}</div>
        </div>
      </div>

    </div>

    <div class="crm-ai">
      <div class="crm-ai-body">
        <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
        <div class="crm-ai-text">${escapeHtml(crmAiText).replace(/\\n/g, '<br>')} Per un'analisi dettagliata, consulta Alpha AI.</div>
      </div>
      <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
    </div>

    <div class="crm-comp" style="margin-top: 12px;">
      <div class="crm-comp-grid">
        ${(() => {
          const fb = ev.competencyFeedback || {};
          const comps = [
            { 
              name: 'Giudizio commerciale', 
              def: 'Valuta la capacità di identificare il lead con il maggior potenziale commerciale, considerando valore, urgenza, probabilità di conversione e contesto.', 
              status: crmScore >= 85 ? 'excellent' : crmScore >= 70 ? 'solid' : crmScore >= 50 ? 'adequate' : 'needs-work', 
              desc: fb.p1_giudizio_commerciale || (crmScore >= 85 ? 'Hai identificato correttamente il lead con il maggior potenziale commerciale.' : 
                    crmScore >= 70 ? 'Hai individuato un lead ad alto potenziale, anche se non la prima scelta assoluta.' : 
                    crmScore >= 50 ? 'La scelta del lead riflette solo parzialmente il reale potenziale commerciale.' : 
                    'Non hai identificato il lead prioritario o i criteri usati non sono abbastanza solidi.') 
            },
            { 
              name: 'Riconoscimento dei segnali d\'acquisto', 
              def: 'Valuta la capacità di identificare e interpretare i principali segnali d\'acquisto, come pain, urgenza, interesse, budget e processo decisionale.', 
              status: crmScore >= 80 ? 'solid' : crmScore >= 60 ? 'adequate' : 'needs-work', 
              desc: fb.p1_riconoscimento_segnali || (crmScore >= 80 ? 'Hai interpretato correttamente pain, urgenza e livello di interesse.' : 
                    crmScore >= 60 ? 'Hai colto alcuni segnali d\'acquisto, ma ne hai tralasciati altri importanti.' : 
                    'Forte difficoltà nell\'interpretare i segnali chiave d\'acquisto e di urgenza.') 
            },
            { 
              name: 'Prioritizzazione dei lead', 
              def: 'Valuta la capacità di ordinare i lead secondo una logica commerciale coerente, assegnando la giusta priorità a ciascuna opportunità.', 
              status: crmScore >= 85 ? 'excellent' : crmScore >= 70 ? 'solid' : crmScore >= 50 ? 'adequate' : 'needs-work', 
              desc: fb.p1_prioritizzazione_lead || (crmScore >= 85 ? 'L\'ordine dei lead riflette una logica commerciale perfetta e coerente.' : 
                    crmScore >= 70 ? 'La prioritizzazione ha senso logico nella maggior parte delle assegnazioni.' : 
                    crmScore >= 50 ? 'Ci sono discrepanze nell\'ordine commerciale assegnato ai lead minori.' : 
                    'L\'ordine assegnato sembra casuale o basato su metriche errate.') 
            },
            { 
              name: 'Coerenza della motivazione', 
              def: 'Valuta quanto la motivazione fornita è coerente con le informazioni disponibili e supporta in modo logico le decisioni prese.', 
              status: crmScore >= 80 ? 'solid' : crmScore >= 60 ? 'adequate' : 'needs-work', 
              desc: fb.p1_coerenza_motivazione || (crmScore >= 80 ? 'La motivazione è ben strutturata e supporta la decisione presa.' : 
                    crmScore >= 60 ? 'La motivazione è presente ma manca di profondità commerciale.' : 
                    'La motivazione è insufficiente, incoerente o del tutto assente.') 
            }
          ];
          const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
          return comps.map(c => `
            <div class="crm-comp-item">
              <div class="crm-comp-name">
                ${escapeHtml(c.name)}
                <div class="crm-comp-info" data-tooltip="${escapeHtml(c.def || '')}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
              </div>
              <div class="crm-comp-score-block">
                <span class="crm-comp-score-num ${c.status}">${c.score || scoresMap[c.status]}</span>
                <span class="crm-comp-score-of">/ 100</span>
              </div>
              <div class="crm-comp-desc">${escapeHtml(c.desc)}</div>
            </div>
          `).join('');
        })()}
      </div>
    </div>
    </div>
  `;
  document.getElementById('rpt-phase-crm').classList.add('collapsed');

  // ══════════════════════════════════════════
  // PHASE 2: DISCOVERY CALL
  // ══════════════════════════════════════════
  const callClass = getScoreClass(callScore);
  const callAiText = getPhaseComment('Chiamata Discovery', callScore);
  const transcript = an.call?.transcript || [];
  window.currentCallDuration = an.call?.callDuration || 0;
  window.currentAudioUrl = an.call?.audioUrl || null;
  if (window.demoAudioElement) {
    window.demoAudioElement.pause();
    window.demoAudioElement = null; // reset if session changes
  }
  const messages = an.call?.messages || [];
  const infoDiscovered = an.call?.informationDiscovered || {};
  const callTimeSpent = an.call?.callDuration ? formatCallDuration(an.call.callDuration) : '—';

  // Metrics
  const talkRatio = ci.talkRatio || 0;
  const listenRatio = ci.listenRatio || (100 - talkRatio);
  const questionsAsked = ci.questionsAsked || 0;

  // Build transcript HTML
  let transcriptHtml = '';
  if (transcript.length > 0) {
    transcriptHtml = transcript.map(t => `
      <div class="rpt-transcript-turn">
        <span class="rpt-transcript-ts">${t.timestamp}</span>
        <div class="rpt-transcript-content">
          <div class="rpt-transcript-speaker ${t.speaker}">${t.speaker === 'candidate' ? `${cand.firstName}` : prospectName}</div>
          <div class="rpt-transcript-text">${escapeHtml(t.text)}</div>
        </div>
      </div>
    `).join('');
  } else if (messages && messages.length > 0) {
    // Fallback to old messages format
    transcriptHtml = messages.map((m, idx) => {
      const isCand = m.role === 'user';
      const speaker = isCand ? cand.firstName : prospectName;
      return `
        <div class="rpt-transcript-turn">
          <span class="rpt-transcript-ts">${formatTimestamp(idx, messages.length, an.call?.callDuration || 300)}</span>
          <div class="rpt-transcript-content">
            <div class="rpt-transcript-speaker ${isCand ? 'candidate' : 'prospect'}">${speaker}</div>
            <div class="rpt-transcript-text">${escapeHtml(m.content)}</div>
          </div>
        </div>
      `;
    }).join('');
  } else if (an.callTranscript) {
    // Bulletproof fallback using the raw callTranscript string
    const lines = an.callTranscript.split('\n');
    transcriptHtml = lines.map(line => {
      const isCand = line.includes('[Candidato]') || line.includes('[candidate]');
      const text = line.replace(/^\[.*?\]:\s*/, '');
      const speaker = isCand ? cand.firstName : prospectName;
      return `
        <div class="rpt-transcript-turn">
          <span class="rpt-transcript-ts">--:--</span>
          <div class="rpt-transcript-content">
            <div class="rpt-transcript-speaker ${isCand ? 'candidate' : 'prospect'}">${speaker}</div>
            <div class="rpt-transcript-text">${escapeHtml(text)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Build information discovered HTML
  const infoFields = ['pain', 'budget', 'timeline', 'urgency', 'decisionMaker', 'process', 'fit', 'nextStep'];
  const infoLabels = { pain: 'Pain', budget: 'Budget', timeline: 'Timeline', urgency: 'Urgenza', decisionMaker: 'Decision Maker', process: 'Processo', fit: 'Fit', nextStep: 'Next Step' };

  const infoHtml = infoFields.map(field => {
    const info = infoDiscovered[field];
    if (!info) return `
      <div class="rpt-info-field">
        <div class="rpt-info-field-hdr">
          <span class="rpt-info-field-label">${infoLabels[field]}</span>
          <span class="rpt-info-status non-emerso">Non emerso</span>
        </div>
        <div class="rpt-info-field-value" style="color: var(--db-text-muted); font-style: italic;">—</div>
      </div>
    `;
    const statusClass = info.status === 'emerso' ? 'emerso' : info.status === 'parziale' ? 'parziale' : 'non-emerso';
    const statusLabel = info.status === 'emerso' ? 'Emerso' : info.status === 'parziale' ? 'Parziale' : 'Non emerso';
    return `
      <div class="rpt-info-field">
        <div class="rpt-info-field-hdr">
          <span class="rpt-info-field-label">${infoLabels[field]}</span>
          <span class="rpt-info-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="rpt-info-field-value">${escapeHtml(info.value)}</div>
        ${info.timestamp ? `<span class="rpt-info-field-ts">${info.timestamp}</span>` : ''}
      </div>
    `;
  }).join('');

  // Waveform SVG (procedurally generated)
  const waveformBars = Array.from({length: 80}, () => Math.random() * 0.7 + 0.3);
  const waveformSvg = `<svg viewBox="0 0 320 32" preserveAspectRatio="none">${waveformBars.map((h, i) =>
    `<rect class="rpt-wave-bar" data-idx="${i}" x="${i * 4}" y="${16 - h * 14}" width="2.5" height="${h * 28}" rx="1" fill="#cbd5e1" style="transition: fill 0.1s ease"/>`
  ).join('')}</svg>`;

  const callEl = document.getElementById('rpt-phase-call');
  callEl.classList.add('collapsed');
  callEl.innerHTML = `
    <div class="rpt-phase-hdr" onclick="togglePhase(this)">
      <div class="rpt-phase-hdr-left">
        <span class="rpt-phase-num">2</span>
        <span class="rpt-phase-title">Discovery Call</span>
      </div>
      <div class="rpt-phase-hdr-right">
        <div class="rpt-phase-score-pill ${callClass}"><span class="pill-dot"></span>${callScore} / 100</div>
        <svg class="rpt-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
    <div class="rpt-phase-content">
      <div class="rpt-phase-content-inner">
        <div class="rpt-phase-desc">In questa fase il candidato doveva condurre una discovery call con un prospect inbound per qualificare l’opportunità, gestire le obiezioni e definire il prossimo passo.</div>

        <div class="crm-body">
          <div class="crm-col crm-col--left">
            <div class="crm-col-hdr">
              <div class="crm-col-title">Transcript della Chiamata</div>
            </div>
            <div class="crm-list" style="height: 320px; overflow-y: auto; padding-right: 8px;">
              ${transcriptHtml ? transcriptHtml : '<div style="padding: 16px; font-size: 13px; color: var(--db-text-muted); font-style: italic;">Transcript non disponibile.</div>'}
            </div>
          </div>
          
          <div class="crm-sep"></div>

          <div class="crm-col crm-col--right">
            <div class="crm-col-hdr">
              <div class="crm-col-title">Registrazione della chiamata</div>
            </div>
            <div class="whatsapp-player-container">
              <div class="rpt-player whatsapp-player">
                <button class="rpt-player-btn" onclick="playDemoAudio()">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <div class="rpt-player-waveform">${waveformSvg}</div>
                <div class="rpt-player-time">00:00 / ${formatCallDuration(an.call?.callDuration || 0)}</div>
              </div>
            </div>

            <div class="rpt-key-moments">
              <div class="rpt-key-moments-title">Momenti chiave della chiamata</div>
              ${(() => {
                const msgList = messages && messages.length > 0 ? messages : (transcript && transcript.length > 0 ? transcript : []);
                if (!msgList || msgList.length === 0) return '<div class="rpt-key-moment"><span class="rpt-km-text">Nessun momento chiave disponibile.</span></div>';
                
                // Pick up to 3 messages from the prospect to highlight
                const prospectMsgs = msgList.map((m, i) => ({ ...m, idx: i })).filter(m => (m.role === 'assistant' || m.speaker === 'prospect'));
                if (prospectMsgs.length === 0) return '<div class="rpt-key-moment"><span class="rpt-km-text">Momenti chiave non disponibili.</span></div>';

                const step = Math.max(1, Math.floor(prospectMsgs.length / 3));
                const moments = [];
                for(let i = 0; i < prospectMsgs.length && moments.length < 3; i += step) {
                  const m = prospectMsgs[i];
                  const ts = m.timestamp && typeof m.timestamp === 'string' ? m.timestamp : formatTimestamp(m.idx, msgList.length, an.call?.callDuration || 0);
                  let text = (m.content || m.text || '').substring(0, 50);
                  if ((m.content || m.text || '').length > 50) text += '...';
                  moments.push({ time: ts, text: 'Prospect: ' + text });
                }
                
                return moments.map(km => `
                <div class="rpt-key-moment" onclick="showToast('Riproduzione da ${km.time}...')">
                    <span class="rpt-ts-pill" style="margin-left: 0; pointer-events: none;"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>${km.time}</span>
                  <span class="rpt-km-text">${escapeHtml(km.text)}</span>
                </div>
              `).join('');
              })()}
            </div>
          </div>
        </div>

        <div class="crm-ai">
          <div class="crm-ai-body">
            <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
            <div class="crm-ai-text">${escapeHtml(callAiText)}</div>
          </div>
          <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
        </div>

        <div class="crm-comp" style="margin-top: 12px;">
          <div class="crm-comp-grid">
            ${(() => {
              const fb = ev.competencyFeedback || {};
              const callComps = [
                { name: 'Esplorazione dei bisogni', def: 'Valuta la capacità di esplorare il contesto del prospect, identificando bisogni, pain point e informazioni rilevanti attraverso domande efficaci.', status: callScore >= 80 ? 'excellent' : callScore >= 60 ? 'solid' : 'adequate', score: callScore >= 80 ? 92 : 75, desc: fb.p2_esplorazione_bisogni || 'Hai lasciato spazio al prospect dimostrando un ottimo listen ratio.' },
                { name: 'Qualificazione dell’opportunità', def: 'Valuta la capacità di raccogliere le informazioni necessarie per comprendere il potenziale dell’opportunità commerciale, considerando priorità, processo decisionale, tempistiche e contesto.', status: callScore >= 85 ? 'excellent' : callScore >= 65 ? 'solid' : 'adequate', score: callScore >= 85 ? 88 : 70, desc: fb.p2_qualificazione_tecnica || 'Hai identificato con chiarezza pain e timeline, leggermente meno il budget.' },
                { name: 'Gestione delle obiezioni', def: 'Valuta la capacità di riconoscere, approfondire e gestire le obiezioni del prospect, mantenendo il focus sugli obiettivi della conversazione.', status: callScore >= 80 ? 'solid' : callScore >= 50 ? 'adequate' : 'needs-work', score: callScore >= 80 ? 85 : 60, desc: fb.p2_riconoscimento_budget || "Hai gestito l'obiezione sul prezzo proponendo subito una demo di valore." },
                { name: 'Controllo della conversazione', def: 'Valuta la capacità di guidare la conversazione mantenendo struttura, direzione e focus, accompagnando il prospect verso il prossimo passo.', status: callScore >= 90 ? 'excellent' : callScore >= 70 ? 'solid' : 'adequate', score: callScore >= 90 ? 95 : 80, desc: fb.p2_gestione_flusso || 'Il tono di voce era sempre rassicurante e la parlata fluida.' }
              ];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              return callComps.map(c => `
                <div class="crm-comp-item">
                  <div class="crm-comp-name">
                    ${escapeHtml(c.name)}
                    <div class="crm-comp-info" data-tooltip="${escapeHtml(c.def || '')}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    </div>
                  </div>
                  <div class="crm-comp-score-block">
                    <span class="crm-comp-score-num ${c.status}">${c.score || scoresMap[c.status]}</span>
                    <span class="crm-comp-score-of">/ 100</span>
                  </div>
                  <div class="crm-comp-desc">${escapeHtml(c.desc)}</div>
                </div>
              `).join('');
            })()}
          </div>
        </div>
    </div>
  `;

  // ══════════════════════════════════════════
  // PHASE 3: QUALIFICATION
  // ══════════════════════════════════════════
  const qualClass = getScoreClass(qualScore);
  const qualAiText = getPhaseComment('Qualificazione', qualScore);
  const qualTimeSpent = qual.timeSpent ? formatCallDuration(qual.timeSpent) : null;
  const accuracyData = qual.accuracyComparison || [];

  // CRM Record fields
  const crmFields = [
    { label: 'Pain', value: qual.pain },
    { label: 'Budget', value: qual.budget },
    { label: 'Decision Maker', value: qual.decisionMaker },
    { label: 'Timeline', value: qual.timeline },
    { label: 'Urgenza', value: qual.urgency },
    { label: 'Fit', value: qual.fit },
    { label: 'Next Step', value: qual.nextStep },
    { label: 'Note', value: qual.notes || 'Nessuna nota aggiuntiva.' }
  ];
  const filledCount = crmFields.filter(f => f.value && f.value.trim()).length;

  const accuracyHtml = `
    <table class="rpt-accuracy-table">
      <thead>
        <tr>
          <th>Campo</th>
          <th>CRM del candidato</th>
          <th>Emerso nella discovery call</th>
          <th style="width: 15%;">Corrispondenza</th>
        </tr>
      </thead>
      <tbody>
        ${crmFields.map(f => {
          if (!f.value && f.label === 'Note') return ''; // Nascondi Note se vuote per ridurre rumore
          
          const acc = accuracyData.find(a => a.field.toLowerCase() === f.label.toLowerCase()) || {};
          const status = acc.status || (f.value && f.value !== 'Nessuna nota aggiuntiva.' ? 'Coerente' : 'N/A');
          const statusClass = status.toLowerCase().replace(/ /g, '-');
          
          const tsHtml = acc.callTimestamp ? ` <button class="rpt-ts-pill" onclick="event.stopPropagation(); showToast('Riproduzione audio da ${acc.callTimestamp}')"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>${escapeHtml(acc.callTimestamp)}</button>` : '';
          const aiText = acc.fromCall ? escapeHtml(acc.fromCall) : 'Nessun appunto rilevante perso.';
          const candText = f.value && f.value !== 'Nessuna nota aggiuntiva.' ? escapeHtml(f.value) : '<span class="empty-val">Non compilato</span>';

          return `
            <tr>
              <td>${escapeHtml(f.label)}</td>
              <td style="width: 40%;" class="cand-text">${candText}</td>
              <td style="width: 35%;" class="ai-text">${aiText}${tsHtml}</td>
              <td style="width: 15%;"><span class="rpt-accuracy-status ${statusClass}">${escapeHtml(status)}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  const qualEl = document.getElementById('rpt-phase-qual');
  qualEl.classList.add('collapsed');
  qualEl.innerHTML = `
    <div class="rpt-phase-hdr" onclick="togglePhase(this)">
      <div class="rpt-phase-hdr-left">
        <span class="rpt-phase-num">3</span>
        <span class="rpt-phase-title">Qualification</span>
      </div>
      <div class="rpt-phase-hdr-right">
        <div class="rpt-phase-score-pill ${qualClass}"><span class="pill-dot"></span>${qualScore} / 100</div>
        <svg class="rpt-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
    <div class="rpt-phase-content">
      <div class="rpt-phase-content-inner">
        <div class="rpt-phase-desc">In questa fase il candidato doveva registrare nel CRM le informazioni emerse durante la discovery call, creando un record accurato e utilizzabile dall’Account Executive.</div>

        <div class="rpt-subsection">
          <div class="crm-col-title" style="margin-bottom: 16px;">Confronto CRM</div>
          ${accuracyHtml}
        </div>

        <div class="crm-ai" style="margin-top: 32px;">
          <div class="crm-ai-body">
            <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
            <div class="crm-ai-text">${escapeHtml(qualAiText)}</div>
          </div>
          <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
        </div>

        <div class="crm-comp" style="margin-top: 12px;">
          <div class="crm-comp-grid">
            ${(() => {
              const fb = ev.competencyFeedback || {};
              const qualComps = [
                { name: 'Identificazione delle informazioni chiave', def: 'Valuta la capacità di riconoscere e registrare le informazioni più rilevanti emerse durante la discovery.', status: qualScore >= 80 ? 'excellent' : qualScore >= 60 ? 'solid' : 'adequate', score: qualScore >= 80 ? 100 : 85, desc: fb.p3_identificazione_informazioni || 'Hai compilato perfettamente Pain, Decision Maker e Timeline.' },
                { name: 'Accuratezza della documentazione', def: 'Valuta la capacità di riportare nel CRM informazioni fedeli alla conversazione, senza errori, omissioni o interpretazioni scorrette.', status: qualScore >= 90 ? 'excellent' : qualScore >= 70 ? 'solid' : 'adequate', score: qualScore >= 90 ? 100 : 80, desc: fb.p3_accuratezza_documentazione || 'Hai interpretato correttamente il fit aziendale senza inventare dati.' },
                { name: 'Orientamento all’Account Executive', def: 'Valuta la capacità di documentare le informazioni in modo che l’Account Executive possa proseguire la trattativa senza dover recuperare ulteriori dettagli.', status: qualScore >= 80 ? 'excellent' : qualScore >= 50 ? 'solid' : 'adequate', score: qualScore >= 80 ? 100 : 70, desc: fb.p3_orientamento_ae || 'Le note aggiunte sono perfette per il follow-up del Sales Manager.' },
                { name: 'Organizzazione delle informazioni', def: 'Valuta la capacità di organizzare le informazioni nel CRM in modo chiaro, strutturato e facilmente consultabile.', status: qualScore >= 85 ? 'excellent' : qualScore >= 60 ? 'solid' : 'adequate', score: qualScore >= 85 ? 100 : 80, desc: fb.p3_organizzazione_informazioni || 'La struttura logica dei campi scelti è molto chiara.' }
              ];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              return qualComps.map(c => `
                <div class="crm-comp-item">
                  <div class="crm-comp-name">
                    ${escapeHtml(c.name)}
                    <div class="crm-comp-info" data-tooltip="${escapeHtml(c.def || '')}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    </div>
                  </div>
                  <div class="crm-comp-score-block">
                    <span class="crm-comp-score-num ${c.status}">${c.score || scoresMap[c.status]}</span>
                    <span class="crm-comp-score-of">/ 100</span>
                  </div>
                  <div class="crm-comp-desc">${escapeHtml(c.desc)}</div>
                </div>
              `).join('');
            })()}
          </div>
        </div>
    </div>
  `;

  // ══════════════════════════════════════════
  // PHASE 4: HANDOFF
  // ══════════════════════════════════════════
  const handoffClass = getScoreClass(handoffScore);
  const handoffAiText = getPhaseComment('Handoff AE', handoffScore);
  const slackThread = an.handoff?.slackThread || [];
  const handoffText = an.handoffMessage?.text || '';
  const candidateMessages = an.candidateMessages || [];
  const contentCoverage = an.handoff?.contentCoverage || [];
  const handoffTimeSpent = an.handoff?.timeSpent ? formatCallDuration(an.handoff.timeSpent) : null;
  const messageCount = an.handoff?.messageCount || (slackThread.length || (handoffText ? 1 : 0) + candidateMessages.length);

  // Build Slack thread HTML
  let slackHtml = '';
  if (slackThread.length > 0) {
    slackHtml = slackThread.map(msg => {
      const msgInitials = msg.sender.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const isAE = msg.role.toLowerCase().includes('account executive');
      const avatarClass = isAE ? 'avatar-ae' : 'avatar-sdr';
      return `
        <div class="rpt-slack-msg${msg.isReply ? ' reply' : ''}">
          <div class="rpt-slack-avatar ${avatarClass}">${msgInitials}</div>
          <div class="rpt-slack-msg-content">
            <div class="rpt-slack-msg-hdr">
              <span class="rpt-slack-msg-name">${escapeHtml(msg.sender)}</span>
              <span class="rpt-slack-msg-role ${avatarClass}">${escapeHtml(msg.role)}</span>
              <span class="rpt-slack-msg-time">${msg.timestamp}</span>
            </div>
            <div class="rpt-slack-msg-text">${escapeHtml(msg.text)}</div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    // Fallback: build from legacy data
    const allMsgs = [];
    if (handoffText) allMsgs.push({ sender: fullName, role: 'SDR Inbound', text: handoffText, isReply: false });
    candidateMessages.forEach(m => allMsgs.push({ sender: fullName, role: 'SDR Inbound', text: m.text, isReply: false, channel: m.channel }));

    slackHtml = allMsgs.map(msg => {
      const isAE = msg.role.toLowerCase().includes('account executive');
      const avatarClass = isAE ? 'avatar-ae' : 'avatar-sdr';
      return `
        <div class="rpt-slack-msg">
          <div class="rpt-slack-avatar ${avatarClass}">${initials}</div>
          <div class="rpt-slack-msg-content">
            <div class="rpt-slack-msg-hdr">
              <span class="rpt-slack-msg-name">${escapeHtml(msg.sender)}</span>
              <span class="rpt-slack-msg-role ${avatarClass}">${escapeHtml(msg.role)}</span>
              ${msg.channel ? `<span class="rpt-slack-msg-role ${avatarClass}">#${escapeHtml(msg.channel)}</span>` : ''}
            </div>
            <div class="rpt-slack-msg-text">${escapeHtml(msg.text)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  const handoffEl = document.getElementById('rpt-phase-handoff');
  handoffEl.classList.add('collapsed');
  handoffEl.innerHTML = `
    <div class="rpt-phase-hdr" onclick="togglePhase(this)">
      <div class="rpt-phase-hdr-left">
        <span class="rpt-phase-num">4</span>
        <span class="rpt-phase-title">Handoff all'AE</span>
      </div>
      <div class="rpt-phase-hdr-right">
        <div class="rpt-phase-score-pill ${handoffClass}"><span class="pill-dot"></span>${handoffScore} / 100</div>
        <svg class="rpt-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
    <div class="rpt-phase-content">
      <div class="rpt-phase-content-inner">
        <div class="rpt-phase-desc">In questa fase il candidato doveva gestire il passaggio di consegne con l’Account Executive, presentando il contesto dell’opportunità e rispondendo alle richieste di approfondimento.</div>

        ${slackHtml ? `
        <div class="rpt-subsection">
          <div class="crm-col-title" style="margin-bottom: 16px;">Conversazione con l’Account Executive</div>
          <div class="rpt-slack-thread">${slackHtml}</div>
        </div>
        ` : `
        <div class="rpt-subsection">
          <div class="crm-col-title" style="margin-bottom: 16px;">Handoff</div>
          <p style="font-size: 13px; color: var(--db-text-muted); font-style: italic; margin: 0;">Nessun messaggio di handoff registrato.</p>
        </div>
        `}

        <div class="crm-ai" style="margin-top: 32px;">
          <div class="crm-ai-body">
            <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
            <div class="crm-ai-text">${escapeHtml(handoffAiText)}</div>
          </div>
          <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
        </div>

        <div class="crm-comp" style="margin-top: 12px;">
          <div class="crm-comp-grid">
            ${(() => {
              const fb = ev.competencyFeedback || {};
              const handoffComps = [
                { name: 'Contestualizzazione dell’opportunità', def: 'Valuta la capacità di presentare all’Account Executive il prospect, il problema emerso e il contesto commerciale necessario per comprendere rapidamente l’opportunità.', status: handoffScore >= 80 ? 'excellent' : handoffScore >= 60 ? 'solid' : 'adequate', score: handoffScore >= 80 ? 95 : 80, desc: fb.p4_contestualizzazione_opportunita || 'Il messaggio introduce in modo chiaro di chi si tratta e perché ha urgenza.' },
                { name: 'Gestione delle richieste dell’AE', def: 'Valuta la capacità di comprendere le richieste di approfondimento dell’Account Executive e rispondere in modo pertinente, chiaro e utile al proseguimento della trattativa.', status: handoffScore >= 85 ? 'excellent' : handoffScore >= 65 ? 'solid' : 'adequate', score: handoffScore >= 85 ? 90 : 75, desc: fb.p4_gestione_richieste || 'Hai riassunto benissimo le problematiche di recruiting e scalabilità.' },
                { name: 'Trasparenza informativa', def: 'Valuta la capacità di distinguere con chiarezza le informazioni effettivamente emerse da quelle non ancora disponibili, evitando supposizioni o ricostruzioni non supportate.', status: handoffScore >= 75 ? 'solid' : handoffScore >= 50 ? 'adequate' : 'needs-work', score: handoffScore >= 75 ? 85 : 65, desc: fb.p4_trasparenza_informativa || 'Indicazioni chiare per la Demo, ma manca un suggerimento su quali slide spingere.' },
                { name: 'Allineamento operativo', def: 'Valuta la capacità di allinearsi con l’Account Executive sulle informazioni mancanti, sulle priorità e sulle azioni necessarie per proseguire la trattativa.', status: handoffScore >= 90 ? 'excellent' : handoffScore >= 70 ? 'solid' : 'adequate', score: handoffScore >= 90 ? 100 : 85, desc: fb.p4_allineamento_operativo || 'Messaggio professionale, ben formattato e facile da leggere per il team.' }
              ];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              return handoffComps.map(c => `
                <div class="crm-comp-item">
                  <div class="crm-comp-name">
                    ${escapeHtml(c.name)}
                    <div class="crm-comp-info" data-tooltip="${escapeHtml(c.def || '')}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    </div>
                  </div>
                  <div class="crm-comp-score-block">
                    <span class="crm-comp-score-num ${c.status}">${c.score || scoresMap[c.status]}</span>
                    <span class="crm-comp-score-of">/ 100</span>
                  </div>
                  <div class="crm-comp-desc">${escapeHtml(c.desc)}</div>
                </div>
              `).join('');
            })()}
          </div>
        </div>
    </div>
  `;

  // ══════════════════════════════════════════
  // PHASE 5: PROCESS IMPROVEMENTS
  // ══════════════════════════════════════════
  const processScore = ev.processScore || 88;
  const processClass = getScoreClass(processScore);
  const processEl = document.getElementById('rpt-phase-process');
  processEl.classList.add('collapsed');
  processEl.innerHTML = `
    <div class=\"rpt-phase-hdr\" onclick=\"togglePhase(this)\">
      <div class=\"rpt-phase-hdr-left\">
        <span class=\"rpt-phase-num\">5</span>
        <span class="rpt-phase-title">Miglioramento del processo</span>
      </div>
      <div class=\"rpt-phase-hdr-right\">
        <div class=\"rpt-phase-score-pill ${processClass}\"><span class=\"pill-dot\"></span>${processScore} / 100</div>
        <svg class=\"rpt-chevron\" viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"/></svg>
      </div>
    </div>
    <div class=\"rpt-phase-content\">
      <div class=\"rpt-phase-content-inner\">
        <div class="rpt-phase-desc">In questa fase il candidato doveva analizzare il processo sperimentato nelle fasi precedenti, individuare eventuali inefficienze e proporre miglioramenti concreti.</div>
        
        <div class="rpt-subsection">
          <div class="crm-col-title" style="margin-bottom: 16px;">Conversazione con il Sales Manager</div>
          <div class="rpt-slack-thread">
            <div class="rpt-slack-msg">
              <div class="rpt-slack-avatar avatar-sdr">${initials}</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">${escapeHtml(fullName)}</span>
                  <span class="rpt-slack-msg-role avatar-sdr">SDR Inbound</span>
                  <span class="rpt-slack-msg-time">10:15</span>
                </div>
                <div class="rpt-slack-msg-text">Ho notato che il tasso di conversione dal form al primo meeting è sceso del 15%. Suggerisco di snellire i campi obbligatori o implementare un tool di booking diretto.</div>
              </div>
            </div>
            <div class="rpt-slack-msg reply">
              <div class="rpt-slack-avatar avatar-ae">SO</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">Sales Ops</span>
                  <span class="rpt-slack-msg-role avatar-ae">Manager</span>
                  <span class="rpt-slack-msg-time">10:42</span>
                </div>
                <div class="rpt-slack-msg-text">Ottima osservazione, è un dato su cui volevamo indagare. Hai in mente un tool specifico?</div>
              </div>
            </div>
            <div class="rpt-slack-msg reply">
              <div class="rpt-slack-avatar avatar-sdr">${initials}</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">${escapeHtml(fullName)}</span>
                  <span class="rpt-slack-msg-role avatar-sdr">SDR Inbound</span>
                  <span class="rpt-slack-msg-time">10:45</span>
                </div>
                <div class="rpt-slack-msg-text">Possiamo usare Calendly o Chili Piper direttamente nella thank you page. In questo modo eliminiamo due passaggi intermedi via email, che attualmente generano drop-off.</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="crm-ai" style="margin-top: 32px;">
          <div class="crm-ai-body">
            <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
            <div class="crm-ai-text">La candidata ha individuato con precisione il problema di conversione del form inbound, proponendo una soluzione pragmatica e difendendola in modo strutturato. Ha dimostrato eccellente proattività.</div>
          </div>
          <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
        </div>

        <div class="crm-comp" style="margin-top: 12px;">
          <div class="crm-comp-grid">
            <div class="crm-comp-item">
              <div class="crm-comp-name">
                Analisi del processo
                <div class="crm-comp-info" data-tooltip="Valuta la capacità di individuare inefficienze, punti di attrito e opportunità di miglioramento sulla base dell’esperienza maturata durante la simulazione.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
              </div>
              <div class="crm-comp-score-block">
                <span class="crm-comp-score-num excellent">85</span>
                <span class="crm-comp-score-of">/ 100</span>
              </div>
              <div class="crm-comp-desc">${ev.competencyFeedback?.p5_analisi_processo || 'Ottima identificazione delle inefficienze nel follow-up.'}</div>
            </div>
            <div class="crm-comp-item">
              <div class="crm-comp-name">
                Progettazione dei miglioramenti
                <div class="crm-comp-info" data-tooltip="Valuta la capacità di proporre interventi concreti, coerenti con i problemi individuati e potenzialmente applicabili al processo di vendita.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
              </div>
              <div class="crm-comp-score-block">
                <span class="crm-comp-score-num solid">80</span>
                <span class="crm-comp-score-of">/ 100</span>
              </div>
              <div class="crm-comp-desc">${ev.competencyFeedback?.p5_progettazione_miglioramenti || 'Soluzioni proposte coerenti e ben strutturate.'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ══════════════════════════════════════════
  // PHASE 6: FOUNDER INTERVIEW
  // ══════════════════════════════════════════
  const founderScore = ev.founderScore || 95;
  const founderClass = getScoreClass(founderScore);
  const founderEl = document.getElementById('rpt-phase-founder');
  founderEl.classList.add('collapsed');
  founderEl.innerHTML = `
    <div class=\"rpt-phase-hdr\" onclick=\"togglePhase(this)\">
      <div class=\"rpt-phase-hdr-left\">
        <span class=\"rpt-phase-num\">6</span>
        <span class=\"rpt-phase-title\">Intervista con il Founder</span>
      </div>
      <div class=\"rpt-phase-hdr-right\">
        <div class=\"rpt-phase-score-pill ${founderClass}\"><span class=\"pill-dot\"></span>${founderScore} / 100</div>
        <svg class=\"rpt-chevron\" viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"/></svg>
      </div>
    </div>
    <div class=\"rpt-phase-content\">
      <div class=\"rpt-phase-content-inner\">
        <div class="rpt-phase-desc">In questa fase il candidato doveva riflettere sull’esperienza svolta, valutare le proprie scelte e confrontarsi con il Founder su possibili aree di miglioramento.</div>
        
        <div class="rpt-subsection">
          <div class="crm-col-title" style="margin-bottom: 16px;">Conversazione con il Founder</div>
          <div class="rpt-slack-thread">
            <div class="rpt-slack-msg">
              <div class="rpt-slack-avatar avatar-ae">MR</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">Marco Rossi</span>
                  <span class="rpt-slack-msg-role avatar-ae">Founder</span>
                  <span class="rpt-slack-msg-time">14:00</span>
                </div>
                <div class="rpt-slack-msg-text">Ciao, partiamo dalla fine: qual è il tuo obiettivo professionale nei prossimi 3 anni?</div>
              </div>
            </div>
            <div class="rpt-slack-msg reply">
              <div class="rpt-slack-avatar avatar-sdr">${initials}</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">${escapeHtml(fullName)}</span>
                  <span class="rpt-slack-msg-role avatar-sdr">SDR Inbound</span>
                  <span class="rpt-slack-msg-time">14:02</span>
                </div>
                <div class="rpt-slack-msg-text">Vorrei padroneggiare il ciclo di vendita inbound per poi transizionare in un ruolo di Account Executive, contribuendo direttamente alla crescita del fatturato. E se ci fosse l'opportunità, mi piacerebbe fare coaching ai futuri SDR.</div>
              </div>
            </div>
            <div class="rpt-slack-msg reply">
              <div class="rpt-slack-avatar avatar-ae">MR</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">Marco Rossi</span>
                  <span class="rpt-slack-msg-role avatar-ae">Founder</span>
                  <span class="rpt-slack-msg-time">14:05</span>
                </div>
                <div class="rpt-slack-msg-text">Molto chiaro. E come valuteresti la tua ultima performance durante questa simulazione, specialmente per la parte di handoff?</div>
              </div>
            </div>
            <div class="rpt-slack-msg reply">
              <div class="rpt-slack-avatar avatar-sdr">${initials}</div>
              <div class="rpt-slack-msg-content">
                <div class="rpt-slack-msg-hdr">
                  <span class="rpt-slack-msg-name">${escapeHtml(fullName)}</span>
                  <span class="rpt-slack-msg-role avatar-sdr">SDR Inbound</span>
                  <span class="rpt-slack-msg-time">14:08</span>
                </div>
                <div class="rpt-slack-msg-text">Credo di aver identificato perfettamente il pain point, ma avrei potuto spingere di più sulla quantificazione esatta del budget disponibile. Inoltre, nel messaggio all'Account Executive, avrei dovuto evidenziare più nettamente il competitor in gioco. È sicuramente la prima cosa che correggerò alla prossima telefonata.</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="crm-ai" style="margin-top: 32px;">
          <div class="crm-ai-body">
            <div class="crm-ai-label"><span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px; background-color: #4659f2; -webkit-mask-image: url('alpha-icon-only.png'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('alpha-icon-only.png'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></span>Valutazione Alpha AI</div>
            <div class="crm-ai-text">La candidata mostra una forte ambizione e una chiara intenzione di crescere nel ruolo. Si adatta perfettamente ai valori aziendali, offrendo uno spaccato onesto sui suoi limiti e su come correggerli.</div>
          </div>
          <button class="rpt-hdr-ai-cta" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha AI <span class="cta-arrow">&rarr;</span></button>
        </div>

        <div class="crm-comp" style="margin-top: 12px;">
          <div class="crm-comp-grid">
            <div class="crm-comp-item">
              <div class="crm-comp-name">
                Consapevolezza professionale
                <div class="crm-comp-info" data-tooltip="Valuta la capacità di analizzare in modo realistico il proprio operato, riconoscendo punti di forza, limiti e aree di miglioramento emerse durante la simulazione.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
              </div>
              <div class="crm-comp-score-block">
                <span class="crm-comp-score-num excellent">92</span>
                <span class="crm-comp-score-of">/ 100</span>
              </div>
              <div class="crm-comp-desc">${ev.competencyFeedback?.p6_consapevolezza_professionale || 'Perfettamente in sintonia con la mentalità orientata ai risultati.'}</div>
            </div>
            <div class="crm-comp-item">
              <div class="crm-comp-name">
                Coachability
                <div class="crm-comp-info" data-tooltip="Valuta la capacità di accogliere feedback, riconsiderare le proprie scelte e tradurre le indicazioni ricevute in comportamenti o approcci migliorativi.">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
              </div>
              <div class="crm-comp-score-block">
                <span class="crm-comp-score-num excellent">88</span>
                <span class="crm-comp-score-of">/ 100</span>
              </div>
              <div class="crm-comp-desc">${ev.competencyFeedback?.p6_coachability || 'Ha espresso obiettivi di crescita chiari ed ambiziosi.'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── SCROLL SPY ──
  setupScrollSpy();
}

// ── HELPERS ──

function scrollToPhase(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.rpt-section');
  const navItems = document.querySelectorAll('.rpt-nav-item');
  if (!sections.length || !navItems.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navItems.forEach(n => n.classList.remove('active'));
        const target = document.querySelector(`.rpt-nav-item[data-target="${entry.target.id}"]`);
        if (target) target.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach(s => observer.observe(s));
}

function formatTimestamp(index, total, duration) {
  const seconds = Math.round((index / Math.max(total - 1, 1)) * duration);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderEmptyPhase(num, title) {
  return `
    <div class="rpt-phase-hdr" onclick="togglePhase(this)">
      <div class="rpt-phase-hdr-left">
        <span class="rpt-phase-num">${num}</span>
        <span class="rpt-phase-title">${title}</span>
      </div>
      <div class="rpt-phase-hdr-right">
        <svg class="rpt-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
    <div class="rpt-phase-content">
      <div class="rpt-phase-content-inner">
        <div class="rpt-phase-desc">Il candidato non ha completato questa fase durante la simulazione.</div>
      </div>
    </div>`;
}

function aiComment(text) {
  return `<div class="rpt-ai-comment"><div class="rpt-ai-comment-label">Commento AI</div><p class="rpt-ai-comment-text">${escapeHtml(text)}</p><span class="rpt-ai-comment-action" onclick="showToast('Apertura Alpha...')">Approfondisci con Alpha →</span></div>`;
}

function emptyState(text) {
  return `<p style="font-size: 13px; color: var(--db-text-muted); font-style: italic; margin: 0;">${escapeHtml(text)}</p>`;
}

function getScoreLevel(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

function getPhaseComment(phaseName, score) {
  if (score >= 90) {
    const c = {
      'Prioritizzazione CRM': 'Il candidato ha dimostrato un\'eccellente capacità di prioritizzazione commerciale. Ha collegato correttamente pain, dimensione e intenzione di acquisto, separando con chiarezza i lead ad alta conversione da quelli puramente esplorativi.',
      'Chiamata Discovery': 'Discovery esemplare. Domande aperte efficaci, ascolto attivo eccellente e identificazione precisa dei bisogni del prospect. Il candidato ha mantenuto il controllo della conversazione lasciando ampio spazio all\'interlocutore.',
      'Qualificazione': 'Qualificazione molto accurata. Il record CRM è coerente con le informazioni emerse durante la call. Le informazioni chiave sono state trasferite fedelmente, con una struttura chiara e utilizzabile dal team Sales.',
      'Handoff AE': 'Handoff completo e professionale. L\'Account Executive dispone di tutte le informazioni necessarie per condurre il prossimo incontro senza dover ricontattare il prospect per chiarimenti.'
    };
    return c[phaseName] || 'Performance eccellente.';
  } else if (score >= 75) {
    const c = {
      'Prioritizzazione CRM': 'Buona prioritizzazione complessiva. La logica commerciale è coerente, anche se alcuni segnali secondari nei dati CRM non sono stati valorizzati nella motivazione.',
      'Chiamata Discovery': 'Buona conduzione della discovery. Ascolto attivo solido e domande pertinenti, con margine di approfondimento su alcune aree chiave come budget e processo decisionale.',
      'Qualificazione': 'Qualificazione solida ma con margini. La maggior parte dei campi è compilata correttamente, ma alcune informazioni risultano incomplete o leggermente imprecise rispetto a quanto emerso nella call.',
      'Handoff AE': 'Handoff adeguato ma con margini. L\'AE può procedere, ma potrebbe dover approfondire autonomamente alcuni aspetti del contesto o del processo decisionale.'
    };
    return c[phaseName] || 'Buona performance.';
  } else if (score >= 50) {
    const c = {
      'Prioritizzazione CRM': 'Prioritizzazione nella media. I criteri utilizzati per l\'ordinamento non sono del tutto coerenti con i segnali commerciali presenti nel CRM. La motivazione risulta generica.',
      'Chiamata Discovery': 'Discovery nella media. Il candidato ha seguito il flusso ma ha posto prevalentemente domande chiuse, lasciando inesplorate diverse aree. Il prospect non è stato approfondito a sufficienza.',
      'Qualificazione': 'Qualificazione parziale. Diversi campi sono compilati in modo generico o contengono informazioni non pienamente supportate dalle evidenze della conversazione.',
      'Handoff AE': 'Handoff incompleto. L\'AE dovrebbe ricontattare il prospect per raccogliere informazioni mancanti prima di procedere con il prossimo incontro.'
    };
    return c[phaseName] || 'Performance nella media.';
  } else {
    return 'Performance sotto la media. Questa fase richiede miglioramento significativo.';
  }
}

async function toggleShortlistDetail() {
  if (!activeSessionId) return;
  try {
    const res = await fetch(`/api/session/${activeSessionId}/shortlist`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    const localSess = sessions.find(s => s.id === activeSessionId);
    if (localSess) localSess.shortlisted = data.shortlisted;
    const textEl = document.getElementById('detail-shortlist-text');
    if (textEl) textEl.textContent = data.shortlisted ? 'In Shortlist' : 'Shortlist';
    showToast(data.shortlisted ? 'Aggiunto alla shortlist' : 'Rimosso dalla shortlist');
    updateKPIs();
  } catch (e) {
    console.error("Shortlist error:", e);
  }
}

// ── SHORTLIST ──
async function toggleShortlistFromCard(event, id) {
  event.stopPropagation();
  try {
    const res = await fetch(`/api/session/${id}/shortlist`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    const localSess = sessions.find(s => s.id === id);
    if (localSess) localSess.shortlisted = data.shortlisted;
    updateKPIs();
    renderOverview();
  } catch (e) {
    console.error("Shortlist error:", e);
  }
}

function updateShortlistButtonState(isShortlisted) {
  const btn = document.getElementById('detail-btn-shortlist');
  const text = document.getElementById('detail-shortlist-text');
  if (isShortlisted) {
    btn.classList.add('active');
    text.textContent = "Shortlisted ✓";
  } else {
    btn.classList.remove('active');
    text.textContent = "Aggiungi a Shortlist";
  }
}

// ── NOTES ──
async function saveNotes() {
  if (!activeSessionId) return;
  const val = document.getElementById('detail-notes').value;
  const statusEl = document.getElementById('notes-status');
  try {
    const res = await fetch(`/api/session/${activeSessionId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: val }),
    });
    if (res.ok) {
      statusEl.textContent = "✓ Note salvate";
      const local = sessions.find(s => s.id === activeSessionId);
      if (local) local.internalNotes = val;
    } else {
      statusEl.textContent = "Errore durante il salvataggio.";
    }
  } catch (e) {
    statusEl.textContent = "Connessione assente.";
  }
}

// ── TOAST ──
function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── HELPERS ──
function formatCallDuration(seconds) {
  if (!seconds || seconds <= 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getScoreClass(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'poor';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
