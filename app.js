/* ══════════════════════════════════════════
   Alpha × Pillar — SDR Simulation FASE 1
   with OpenAI TTS Voice
   ══════════════════════════════════════════ */

// ── Image Preloading (Performance) ──
function preloadImages() {
  const images = [
    'founder.png', 'avatar-marco.jpg', 'avatar-sara.jpg', 'avatar-andrea.jpg', 
    'avatar-giulia.jpg', 'avatar-luca.jpg', 'avatar-marchetti.jpg', 'avatar-ferraro.jpg', 
    'avatar-greenbuild.jpg', 'avatar-parisi.jpg', 'avatar-rossi.jpg', 'logo-pillar.png', 
    'alpha-icon-only.png', 'logos-combined.png', 'logos-combined-tight.png',
    'comp_0.png', 'original-im1.jpg', 'original-im2.png', 'slice_0.png'
  ];
  images.forEach(src => {
    const img = new Image();
    img.src = src;
  });
}
preloadImages();

// ── Analytics state ──
const analytics = {
  startTime: Date.now(),
  founderWatchTime: 0,
  slackReadStart: 0,
  slackReadTime: 0,
  interactions: 0,
  slideTimestamps: [],
};

let currentLead = null;

// ── Dev mode: skip phases with keyboard ──
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const phaseMap = {
    '0': 'phase-boot',
    '1': 'phase-founder',
    '2': 'phase-slack',
    '3': 'phase-crm',
    '4': 'phase-call',
    '5': 'phase-qualification',
  };
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (phaseMap[e.key]) {
      console.log(`⏩ DEV: Skipping to ${phaseMap[e.key]}`);
      document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
      document.getElementById(phaseMap[e.key]).classList.add('active');
      // Close any open overlays
      document.getElementById('candidate-overlay')?.classList.remove('active');
    }
  });
  console.log('🛠️ DEV MODE: Press 0=Boot, 1=Founder, 2=Slack to skip phases');
}

// ── TTS audio cache ──
const audioCache = [];

// ── Phase management ──
function showPhase(id) {
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Founder slides ──
const founderSlides = [
  {
    text: 'Ciao, sono Gabriel. Benvenuto in Pillar.',
    html: 'Ciao, sono <strong>Gabriel</strong>. Benvenuto in <strong>Pillar</strong>.',
  },
  {
    text: "Stiamo costruendo il sistema operativo per l'edilizia. Un settore da 13 trilioni che ancora lavora con fogli Ecsel e WhatsApp.",
    html: "Stiamo costruendo il <strong>sistema operativo per l'edilizia</strong>. Un settore da 13 trilioni che ancora lavora con fogli Excel e WhatsApp.",
  },
  {
    text: 'In meno di un anno abbiamo raggiunto oltre 500 imprese e chiuso un round da 12 milioni di euro.',
    html: 'In meno di un anno abbiamo raggiunto <strong>oltre 500 imprese</strong> e chiuso un round da <strong>€12 milioni</strong>.',
  },
  {
    text: "Come esse di erre Inbound sarai il primo contatto con chi mostra interesse per Pillar. Il tuo compito sarà capire se c’è un reale bisogno, qualificare l’opportunità e organizzare una demo con uno dei nostri Account Executive.",
    html: "Come <strong>SDR Inbound</strong> sarai il primo contatto con chi mostra interesse per Pillar. Il tuo compito sarà capire se c’è un <strong>reale bisogno</strong>, qualificare l’opportunità e organizzare una demo con uno dei nostri <strong>Account Executive</strong>.",
  },
  {
    text: "Oggi vivrai una simulazione ispirata a una vera giornata di lavoro. Dovrai prendere decisioni, parlare con un potenziale cliente e qualificare le opportunità migliori.",
    html: "Oggi vivrai una simulazione ispirata a una <strong>vera giornata di lavoro</strong>. Dovrai prendere decisioni, parlare con un potenziale cliente e qualificare <strong>le opportunità migliori</strong>.",
  },
  {
    text: "Non cerchiamo la risposta perfetta. Vogliamo capire come ragioni, come impari e come affronti le sfide.",
    html: "Non cerchiamo la risposta perfetta. Vogliamo capire come <strong>ragioni</strong>, come <strong>impari</strong> e come affronti le <strong>sfide</strong>.",
  },
  {
    text: "Qui non si gestiscono lead. Si costruisce crescita. Iniziamo.",
    html: "Qui non si gestiscono lead. <strong>Si costruisce crescita. Iniziamo.</strong>",
  },
];

// ══════════════════════════════════════════
// TTS — Fetch audio from server proxy
// ══════════════════════════════════════════
async function fetchTTS(text) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'ash' }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    // Wait for audio metadata to load so we know duration
    await new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
    });
    return audio;
  } catch (e) {
    console.warn('TTS fallback for:', text.substring(0, 40), e);
    return null;
  }
}

// ══════════════════════════════════════════
// PHASE 0 — BOOT (preload TTS silently in background)
// ══════════════════════════════════════════

async function runBoot() {
  // Check if we want to skip founder presentation entirely (bypasses TTS preload API costs)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('skipfounder') === 'true') {
    console.log('⏩ Dev Mode: Bypassing Founder Presentation & TTS Preloading');
    analytics.candidate = { firstName: 'Luca', lastName: 'Dev', email: 'dev@pillar.it' };
    candidateName = 'Luca';
    
    // Skip to Slack phase directly
    showPhase('phase-slack');
    setTimeout(() => {
      startSlackPhase();
    }, 100);
    return;
  }

  // Preload TTS for slides 1+ sequentially in background to avoid Cartesia rate limits
  (async () => {
    for (let i = 1; i < founderSlides.length; i++) {
      try {
        audioCache[i] = await fetchTTS(founderSlides[i].text);
      } catch (err) {
        console.warn('Failed to load TTS for slide', i);
      }
    }
    const ttsLoaded = audioCache.filter(Boolean).length;
    console.log(`✅ TTS loaded: ${ttsLoaded}/${founderSlides.length} slides`);
  })();

  // CTA opens candidate form
  const startBtn = document.getElementById('btn-start-sim');
  const overlay = document.getElementById('candidate-overlay');
  const form = document.getElementById('candidate-form');

  startBtn.addEventListener('click', () => {
    overlay.classList.add('active');
    document.getElementById('cand-name').focus();
  }, { once: true });

  let formSubmitted = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (formSubmitted) return;
    formSubmitted = true;

    const submitBtn = form.querySelector('.btn-candidate-submit');
    submitBtn.querySelector('.btn-start-inner').textContent = 'Preparazione in corso…';
    submitBtn.disabled = true;

    const firstName = document.getElementById('cand-name').value.trim();
    const lastName = document.getElementById('cand-surname').value.trim();
    const email = document.getElementById('cand-email').value.trim();

    // Store candidate data
    analytics.candidate = { firstName, lastName, email };
    candidateName = firstName;

    // Personalize first slide
    founderSlides[0].text = `Ciao ${firstName}, sono Gabriel. Benvenuto in Pillar.`;
    founderSlides[0].html = `Ciao <strong>${firstName}</strong>, sono <strong>Gabriel</strong>. Benvenuto in <strong>Pillar</strong>.`;

    // Generate personalized TTS for slide 0
    const personalAudio = await fetchTTS(founderSlides[0].text);
    audioCache[0] = personalAudio;

    // Start simulation
    overlay.classList.remove('active');
    showPhase('phase-founder');
    setTimeout(startFounderPresentation, 400);
  });
}

// ══════════════════════════════════════════
// PHASE 1 — FOUNDER PRESENTATION with TTS
// ══════════════════════════════════════════
const captionEl = document.getElementById('founder-caption');
const dotsContainer = document.getElementById('slide-dots');
const audioWave = document.getElementById('audio-wave');

// Create dots
founderSlides.forEach((_, i) => {
  const d = document.createElement('span');
  d.className = 'dot' + (i === 0 ? ' active' : '');
  dotsContainer.appendChild(d);
});
const dots = dotsContainer.querySelectorAll('.dot');

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

// Compute remaining duration from slide index onward
function getRemainingDuration(fromIndex) {
  let total = 0;
  for (let i = fromIndex; i < founderSlides.length; i++) {
    const audio = audioCache[i];
    if (audio && isFinite(audio.duration)) {
      total += audio.duration * 1000 + 500;
    } else {
      total += 4000;
    }
  }
  return total;
}

// Track current slide for timer
let currentSlideIndex = 0;
let slideStartTime = 0;

async function playSlide(index) {
  const slide = founderSlides[index];
  const audio = audioCache[index];
  currentSlideIndex = index;
  slideStartTime = Date.now();

  // Update dots
  dots.forEach((d, j) => d.classList.toggle('active', j === index));

  // Fade out previous caption
  captionEl.classList.remove('caption-visible');
  await new Promise(r => setTimeout(r, 200));

  // Show new caption with fade-in
  captionEl.innerHTML = slide.html;
  void captionEl.offsetWidth;
  captionEl.classList.add('caption-visible');

  if (audio) {
    audioWave.classList.remove('paused');
    const audioPromise = new Promise(resolve => {
      audio.addEventListener('ended', resolve, { once: true });
      audio.play().catch(() => resolve());
    });
    await audioPromise;
    audioWave.classList.add('paused');
    await new Promise(r => setTimeout(r, 500));
  } else {
    await new Promise(r => setTimeout(r, 4000));
  }
}

async function startFounderPresentation() {
  analytics.founderWatchStart = Date.now();
  const totalDuration = getRemainingDuration(0);
  const globalStart = Date.now();

  // Play each slide sequentially
  for (let i = 0; i < founderSlides.length; i++) {
    analytics.slideTimestamps.push(Date.now());
    await playSlide(i);
  }

  // End — stop audio wave
  audioWave.classList.add('paused');
  analytics.founderWatchTime = Date.now() - analytics.founderWatchStart;

  // Transition to Slack
  await new Promise(r => setTimeout(r, 1200));
  showPhase('phase-slack');
  setTimeout(startSlackPhase, 500);
}

// ══════════════════════════════════════════
// PHASE 2 — WORKSPACE (Slack-inspired)
// ══════════════════════════════════════════

// ── Team members ──
const team = {
  marco:   { name: 'Marco Conti',   initials: 'MC', color: 'linear-gradient(135deg,#6366f1,#7c3aed)', role: 'Sales Manager', avatar: 'avatar-marco.jpg' },
  luca:    { name: 'Luca Bianchi',  initials: 'LB', color: 'linear-gradient(135deg,#3b82f6,#2563eb)', role: 'SDR Senior', avatar: 'avatar-luca.jpg' },
  sara:    { name: 'Sara Ricci',    initials: 'SR', color: 'linear-gradient(135deg,#ec4899,#db2777)', role: 'Account Executive', avatar: 'avatar-sara.jpg' },
  giulia:  { name: 'Giulia Ferro',  initials: 'GF', color: 'linear-gradient(135deg,#22c55e,#16a34a)', role: 'SDR', avatar: 'avatar-giulia.jpg' },
  andrea:  { name: 'Andrea Russo',  initials: 'AR', color: 'linear-gradient(135deg,#f97316,#ea580c)', role: 'Marketing', avatar: 'avatar-andrea.jpg' },
  gabriel: { name: 'Gabriel G.',    initials: 'GG', color: 'linear-gradient(135deg,#7c3aed,#9333ea)', role: 'Founder', avatar: 'founder.png' },
};

// ── Channel data ──
const channelTopics = {
  welcome: 'Benvenuto nel team Pillar',
  general: 'Conversazioni generali del team',
  sales:   'Pipeline, deal e aggiornamenti commerciali',
  inbound: 'Lead inbound e opportunità',
  'dm-marco': '',
  'dm-sara': '',
  'dm-gabriel': '',
};

// Store messages per channel
const channelMessages = {
  welcome: [],
  general: [],
  sales: [],
  inbound: [],
  'dm-marco': [],
  'dm-sara': [],
  'dm-gabriel': [],
};

const channelHistory = {
  welcome: [],
  general: [],
  sales: [],
  inbound: [],
  'dm-marco': [],
  'dm-sara': [],
  'dm-gabriel': [],
};

const lastSenderInChannel = {
  welcome: '',
  general: '',
  sales: '',
  inbound: '',
  'dm-marco': '',
  'dm-sara': '',
  'dm-gabriel': '',
};

let activeChannel = 'welcome';
let candidateName = '';
let welcomeSequenceDone = false;
let crmOpened = false;
let handoffMode = false;
let builderMode = false;
let founderMode = false;
let founderConversation = [];

// ── DOM refs ──
const wsMessages = document.getElementById('ws-messages');
const wsScroll = document.getElementById('ws-messages-scroll');
const wsChannelName = document.getElementById('ws-chat-channel-name');
const wsTopic = document.getElementById('ws-chat-topic');
const wsTypingBar = document.getElementById('ws-typing-bar');
const wsTypingText = document.getElementById('ws-typing-text');
const wsInput = document.getElementById('ws-input');
const wsSendBtn = document.getElementById('ws-send');

// ── Helpers ──
function wsDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
function wsNow() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

// ══════════════════════════════════════════
// SOUND ENGINE (Web Audio API — no files)
// ══════════════════════════════════════════
let sndCtx = null;
function getSndCtx() {
  if (!sndCtx) {
    sndCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sndCtx && sndCtx.state === 'suspended') {
    sndCtx.resume().catch(() => {});
  }
  return sndCtx;
}

// Resume AudioContext on first user interaction (critical for bypass / ?skipfounder mode)
// Using capturing phase (capture: true) and mousedown ensures this runs BEFORE element-specific click listeners.
['mousedown', 'keydown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    const ctx = getSndCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, { capture: true, once: true });
});

function playNotifSound() {
  try {
    const ctx = getSndCtx();
    // Slack-like "knock" — two short tones
    [0, 0.08].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1100;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.12);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.15);
    });
  } catch(e) {}
}

function playSendSound() {
  try {
    const ctx = getSndCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

function playClickSound() {
  try {
    const ctx = getSndCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 500;
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch(e) {}
}

function createMsgHTML(member, time, html, opts = {}, channel = null) {
  let isGrouped = false;
  if (channel && lastSenderInChannel[channel] === member.name && !opts.forceNewBlock) {
    isGrouped = true;
  }
  if (channel) {
    lastSenderInChannel[channel] = member.name;
  }

  const msg = document.createElement('div');
  msg.setAttribute('data-sender', member.name);

  if (isGrouped) {
    msg.className = 'ws-msg ws-msg-grouped';
    msg.innerHTML = `
      <div class="ws-msg-time-hover">${time}</div>
      <div class="ws-msg-body">
        <div class="ws-msg-text">${html}</div>
        ${opts.reactions ? `<div class="ws-reactions">${opts.reactions.map(r =>
          `<div class="ws-reaction">${r.emoji}<span class="ws-reaction-count">${r.count}</span></div>`
        ).join('')}</div>` : ''}
      </div>
    `;
  } else {
    msg.className = 'ws-msg';
    const avatarHTML = member.avatar 
      ? `<img decoding="sync" src="${member.avatar}" alt="${member.name}">` 
      : member.initials;
    const avatarStyle = member.avatar ? '' : `style="background:${member.color}"`;
    msg.innerHTML = `
      <div class="ws-msg-avatar" ${avatarStyle}>${avatarHTML}</div>
      <div class="ws-msg-body">
        <div class="ws-msg-header">
          <span class="ws-msg-name">${member.name}</span>
          <span class="ws-msg-time">${time}</span>
        </div>
        <div class="ws-msg-text">${html}</div>
        ${opts.reactions ? `<div class="ws-reactions">${opts.reactions.map(r =>
          `<div class="ws-reaction">${r.emoji}<span class="ws-reaction-count">${r.count}</span></div>`
        ).join('')}</div>` : ''}
      </div>
    `;
  }
  return msg;
}

function addMsgToChannel(channel, msgEl, opts = {}) {
  channelMessages[channel].push(msgEl);
  
  if (opts.sender && opts.content) {
    channelHistory[channel].push({
      sender: opts.sender,
      senderName: opts.senderName || '',
      content: opts.content
    });
  }

  if (activeChannel === channel) {
    wsMessages.appendChild(msgEl);
    wsScroll.scrollTop = wsScroll.scrollHeight;
  } else {
    updateBadge(channel);
  }
  // Play sound for incoming messages (not for own messages)
  if (!opts.silent && !opts.own) playNotifSound();
}

function updateBadge(channel) {
  const badge = document.getElementById(`badge-${channel}`);
  if (!badge) return;
  const current = parseInt(badge.textContent) || 0;
  badge.textContent = current + 1;
  badge.style.display = 'inline-block';
  // Re-trigger pop animation
  badge.style.animation = 'none';
  void badge.offsetWidth;
  badge.style.animation = '';
}

function clearBadge(channel) {
  const badge = document.getElementById(`badge-${channel}`);
  if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
}

async function showTyping(name, durationMs = 1200) {
  wsTypingText.textContent = `${name} sta scrivendo…`;
  wsTypingBar.style.display = 'flex';
  await wsDelay(durationMs);
  wsTypingBar.style.display = 'none';
}

// ── Channel switching ──
function switchChannel(channel) {
  if (channel === activeChannel) return;

  // Block switching to locked DM channels
  const targetEl = document.querySelector(`.ws-channel[data-channel="${channel}"]`);
  if (targetEl && targetEl.classList.contains('ws-dm-locked')) return;

  activeChannel = channel;
  playClickSound();

  const isDM = channel.startsWith('dm-');

  // Update sidebar active state
  document.querySelectorAll('.ws-channel[data-channel]').forEach(el => {
    el.classList.toggle('ws-channel-active', el.dataset.channel === channel);
  });

  // Update header
  const hashEl = document.getElementById('ws-chat-hash');
  const onlineDot = document.getElementById('ws-chat-online-dot');
  const dmNames = { 'dm-marco': 'Marco Conti', 'dm-sara': 'Sara Ricci', 'dm-gabriel': 'Gabriel G.' };
  const dmRoles = { 'dm-marco': 'Sales Manager', 'dm-sara': 'Account Executive', 'dm-gabriel': 'Founder' };
  if (isDM) {
    wsChannelName.textContent = dmNames[channel] || channel;
    if (hashEl) hashEl.style.display = 'none';
    if (onlineDot) onlineDot.style.display = 'inline-block';
    wsTopic.textContent = dmRoles[channel] || '';
    wsInput.placeholder = `Scrivi un messaggio a ${dmNames[channel] || channel}…`;
  } else {
    wsChannelName.textContent = channel;
    if (hashEl) hashEl.style.display = '';
    if (onlineDot) onlineDot.style.display = 'none';
    wsTopic.textContent = channelTopics[channel] || '';
    wsInput.placeholder = `Scrivi un messaggio in #${channel}…`;
  }

  // Handle compose-mode textarea: hide/show without destroying (preserves event listeners)
  const composeTextarea = document.getElementById('ws-compose-textarea');
  const needsCompose = (channel === 'dm-sara' && handoffMode) || (channel === 'dm-marco' && builderMode) || (channel === 'dm-gabriel' && founderMode);

  if (needsCompose && composeTextarea) {
    // Entering compose channel — show textarea, hide input
    composeTextarea.style.display = '';
    wsInput.style.display = 'none';
    // Restore send button state based on textarea content
    const words = composeTextarea.value.trim().split(/\s+/).filter(w => w).length;
    const maxWords = builderMode ? 300 : 150;
    wsSendBtn.disabled = words < 5 || words > maxWords;
  } else if (!needsCompose && composeTextarea) {
    // Leaving compose channel — hide textarea, show input
    composeTextarea.style.display = 'none';
    wsInput.style.display = '';
    wsSendBtn.disabled = !wsInput.value.trim();
  } else if (!composeTextarea) {
    // No compose mode — make sure normal input is visible
    wsInput.style.display = '';
    wsSendBtn.disabled = !wsInput.value.trim();
  }

  // Clear badge
  clearBadge(channel);

  // Render messages
  renderChannel(channel);
}

function renderChannel(channel) {
  // Clear current messages
  wsMessages.innerHTML = '';

  // Re-append stored messages
  channelMessages[channel].forEach(msg => {
    // Clone to re-trigger animation
    const clone = msg.cloneNode(true);
    clone.style.animation = 'none';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    wsMessages.appendChild(clone);
  });

  wsScroll.scrollTop = wsScroll.scrollHeight;
}

// Bind sidebar clicks (channels + DMs)
document.querySelector('.ws-sidebar').addEventListener('click', (e) => {
  const li = e.target.closest('.ws-channel[data-channel]');
  if (li) switchChannel(li.dataset.channel);
});

// ── Pre-populate channels ──
function prePopulateChannels() {
  // #general — team already active
  const g1 = createMsgHTML(team.luca, '08:45', 'Buongiorno a tutti! ☕', {}, 'general');
  const g2 = createMsgHTML(team.giulia, '08:47', 'Buongiorno! Oggi ho 3 follow-up da fare 💪', {}, 'general');
  const g3 = createMsgHTML(team.sara, '08:52', 'Demo chiusa con EdilNova 🎉 Contratto firmato!', {
    reactions: [
      { emoji: '🎉', count: 6 },
      { emoji: '🚀', count: 4 },
      { emoji: '💪', count: 3 },
    ]
  }, 'general');
  channelMessages.general.push(g1, g2, g3);
  channelHistory.general.push(
    { sender: 'luca', senderName: team.luca.name, content: 'Buongiorno a tutti! ☕' },
    { sender: 'giulia', senderName: team.giulia.name, content: 'Buongiorno! Oggi ho 3 follow-up da fare 💪' },
    { sender: 'sara', senderName: team.sara.name, content: 'Demo chiusa con EdilNova 🎉 Contratto firmato!' }
  );

  // #sales — pipeline context
  const s1 = createMsgHTML(team.marco, '08:30', 'Aggiornamento pipeline: questa settimana abbiamo <em>12 deal attivi</em> e 3 in fase di closing.', {}, 'sales');
  const s2 = createMsgHTML(team.sara, '08:35', 'Ho un follow-up con Costruzioni Romani alle 14:00. Se qualcuno ha info sul loro volume cantieri, mi faccia sapere.', {}, 'sales');
  const s3 = createMsgHTML(team.marco, '08:40', 'Reminder: obiettivo settimanale è <em>8 demo prenotate</em>. Siamo a 5. Spingiamo 🔥', {}, 'sales');
  channelMessages.sales.push(s1, s2, s3);
  channelHistory.sales.push(
    { sender: 'marco', senderName: team.marco.name, content: 'Aggiornamento pipeline: questa settimana abbiamo 12 deal attivi e 3 in fase di closing.' },
    { sender: 'sara', senderName: team.sara.name, content: 'Ho un follow-up con Costruzioni Romani alle 14:00. Se qualcuno ha info sul loro volume cantieri, mi faccia sapere.' },
    { sender: 'marco', senderName: team.marco.name, content: 'Reminder: obiettivo settimanale è 8 demo prenotate. Siamo a 5. Spingiamo 🔥' }
  );

  // #inbound — lead context
  const i1 = createMsgHTML(team.andrea, '08:50', '📊 Report settimanale: <em>14 nuovi lead</em> da campagne LinkedIn e Google Ads. Qualità media alta.', {}, 'inbound');
  const i2 = createMsgHTML(team.marco, '08:55', 'Grazie Andrea. Team SDR: controllate la pipeline, ci sono opportunità calde da qualificare oggi.', {}, 'inbound');
  channelMessages.inbound.push(i1, i2);
  channelHistory.inbound.push(
    { sender: 'andrea', senderName: team.andrea.name, content: '📊 Report settimanale: 14 nuovi lead da campagne LinkedIn e Google Ads. Qualità media alta.' },
    { sender: 'marco', senderName: team.marco.name, content: 'Grazie Andrea. Team SDR: controllate la pipeline, ci sono opportunità calde da qualificare oggi.' }
  );
}

// ── Welcome sequence (main onboarding) ──
async function runWelcomeSequence() {
  const firstName = candidateName;

  // Message 1 — 09:02
  await showTyping('Marco', 1000);
  const m1 = createMsgHTML(team.marco, '09:02', `Ciao ${firstName}, benvenuto nel team! 👋`, {}, 'welcome');
  addMsgToChannel('welcome', m1, { sender: 'marco', senderName: team.marco.name, content: `Ciao ${firstName}, benvenuto nel team! 👋` });
  await wsDelay(1200);

  // Message 2 — 09:03
  await showTyping('Marco', 1800);
  const m2 = createMsgHTML(team.marco, '09:03', `Partiamo dalla pipeline inbound: nel CRM troverai alcuni lead arrivati negli ultimi giorni, con le informazioni e le attività che avresti normalmente a disposizione.`, {}, 'welcome');
  addMsgToChannel('welcome', m2, { sender: 'marco', senderName: team.marco.name, content: `Partiamo dalla pipeline inbound: nel CRM troverai alcuni lead arrivati negli ultimi giorni, con le informazioni e le attività che avresti normalmente a disposizione.` });
  await wsDelay(1500);

  // Message 3 — 09:04
  await showTyping('Marco', 2000);
  const m3 = createMsgHTML(team.marco, '09:04', `Dovrai analizzare i lead, ordinarli in base alla priorità con cui li contatteresti e spiegarmi cosa ha guidato le tue decisioni.`, {}, 'welcome');
  addMsgToChannel('welcome', m3, { sender: 'marco', senderName: team.marco.name, content: `Dovrai analizzare i lead, ordinarli in base alla priorità con cui li contatteresti e spiegarmi cosa ha guidato le tue decisioni.` });
  await wsDelay(1500);

  // Message 4 — 09:05
  await showTyping('Marco', 2400);
  const m4 = createMsgHTML(team.marco, '09:05', `Le informazioni non saranno sempre complete e alcuni segnali potrebbero essere più rilevanti di altri. Se prima di decidere vuoi raccogliere più contesto, esplora pure il workspace.`, {}, 'welcome');
  addMsgToChannel('welcome', m4, { sender: 'marco', senderName: team.marco.name, content: `Le informazioni non saranno sempre complete e alcuni segnali potrebbero essere più rilevanti di altri. Se prima di decidere vuoi raccogliere più contesto, esplora pure il workspace.` });
  await wsDelay(1500);

  // Message 5 — 09:06
  await showTyping('Marco', 1000);
  const m5 = createMsgHTML(team.marco, '09:06', `Quando sei pronto, apri il CRM.`, {}, 'welcome');
  addMsgToChannel('welcome', m5, { sender: 'marco', senderName: team.marco.name, content: `Quando sei pronto, apri il CRM.` });
  await wsDelay(800);

  // Persistent CTA Banner
  const ctaWrapper = document.createElement('div');
  ctaWrapper.className = 'ws-cta-wrapper';
  ctaWrapper.id = 'ws-cta-wrapper';
  ctaWrapper.innerHTML = `
    <div class="ws-cta-banner">
      <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
      <button class="ws-cta-btn" id="ws-cta-open-crm">
        Apri CRM →
      </button>
    </div>
  `;
  addMsgToChannel('welcome', ctaWrapper);

  // Bind CTA via event delegation (cloneNode in renderChannel loses direct listeners)
  wsMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('#ws-cta-open-crm, .ws-cta-btn');
    if (!btn || crmOpened) return;
    crmOpened = true;
    analytics.interactions++;
    analytics.slackReadTime = Date.now() - analytics.slackReadStart;
    analytics.totalTime = Date.now() - analytics.startTime;
    // Transition to CRM phase
    showPhase('phase-crm');
    setTimeout(() => {
      if (typeof initCRM === 'function') initCRM();
    }, 400);
  });

  // Enable input after welcome sequence
  welcomeSequenceDone = true;
  wsInput.disabled = false;
  wsSendBtn.disabled = false;
  wsInput.focus();

  // ── Auto-nudge if candidate doesn't click CRM ──
  startNudgeTimers();
}

// ── Nudge timers ──
let nudgeCount = 0;
function startNudgeTimers() {
  // First nudge after 45 seconds (timestamp 10:41)
  setTimeout(async () => {
    if (crmOpened || nudgeCount > 0) return; // already nudged or CRM opened
    nudgeCount++;
    if (activeChannel === 'welcome') {
      await showTyping('Marco', 1200);
    }
    const nudge1 = createMsgHTML(team.marco, '10:41', `Sei pronto? Apri il CRM quando vuoi e inizia a dare un’occhiata ai lead.`, { forceNewBlock: true }, 'welcome');
    addMsgToChannel('welcome', nudge1, { sender: 'marco', senderName: team.marco.name, content: `Sei pronto? Apri il CRM quando vuoi e inizia a dare un’occhiata ai lead.` });
  }, 45000);

  // Second nudge / Auto-redirect after 150 seconds (2.5 minutes) (timestamp 10:43)
  setTimeout(async () => {
    if (crmOpened) return;
    
    const currentPhase = document.querySelector('.phase.active')?.id;
    if (currentPhase !== 'phase-slack') return;

    nudgeCount = 999; // prevent other actions
    
    // Force switch to welcome channel to ensure it renders visually
    activeChannel = ''; 
    switchChannel('welcome');
    await wsDelay(1000); // short delay to register switch
    
    await showTyping('Marco', 1500);
    const forceMsg = createMsgHTML(team.marco, '10:43', 
      `Perfetto, direi che è il momento di iniziare.<br><br>Ti ho aperto la pipeline inbound. Ora sta a te capire dove vale davvero la pena investire il tuo tempo.`, 
      { forceNewBlock: true }, 'welcome');
    addMsgToChannel('welcome', forceMsg, { sender: 'marco', senderName: team.marco.name, content: `Perfetto, direi che è il momento di iniziare. Ti ho aperto la pipeline inbound. Ora sta a te capire dove vale davvero la pena investire il tuo tempo.` });
    
    // Auto-trigger CRM open after 6 seconds so they can read the message first
    setTimeout(() => {
      if (!crmOpened) {
        const currentPhase2 = document.querySelector('.phase.active')?.id;
        if (currentPhase2 === 'phase-slack') {
          const btn = document.getElementById('ws-cta-open-crm');
          if (btn) btn.click();
        }
      }
    }, 6000);
  }, 150000);
}

// ── Candidate message sending ──
const candidateMember = {
  get name() { return candidateName || 'Tu'; },
  get initials() { return (candidateName || 'T').charAt(0).toUpperCase(); },
  color: 'linear-gradient(135deg,#f97316,#ef4444)',
};

function sendCandidateMessage() {
  // Compose mode — delegate only when on the compose channel
  const onComposeChannel = (handoffMode && activeChannel === 'dm-sara') || (builderMode && activeChannel === 'dm-marco') || (founderMode && activeChannel === 'dm-gabriel');
  if (onComposeChannel && window._composeOnSend) {
    window._composeOnSend();
    return;
  }
  const text = wsInput.value.trim();
  if (!text) return;

  wsInput.value = '';
  playSendSound();
  analytics.interactions++;

  const msg = createMsgHTML(candidateMember, wsNow(), text, {}, activeChannel);
  addMsgToChannel(activeChannel, msg, { own: true, sender: 'user', senderName: candidateMember.name, content: text });

  // Track what candidate writes
  if (!analytics.candidateMessages) analytics.candidateMessages = [];
  analytics.candidateMessages.push({ channel: activeChannel, text, time: Date.now() });

  // Auto-replies
  triggerAutoReply(activeChannel, text);
}

// Bind input — works for both normal input and compose textarea
function handleEnterKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCandidateMessage();
  }
}
wsInput.addEventListener('keydown', handleEnterKey);
wsSendBtn.addEventListener('click', sendCandidateMessage);

// ── Auto-replies via OpenAI API ──
const replyCountPerChannel = {
  welcome: 0,
  general: 0,
  sales: 0,
  inbound: 0,
  'dm-marco': 0,
  'dm-sara': 0,
};
const MAX_REPLIES_SECONDARY = 2; // limit for general, sales, inbound

function getColleagueForChannel(channel, text = '') {
  const txt = text.toLowerCase();
  if (channel === 'welcome') return 'marco';
  if (channel === 'dm-marco') return 'marco';
  if (channel === 'dm-sara') return 'sara';
  if (channel === 'sales') return 'sara';
  if (channel === 'inbound') return 'andrea';
  
  if (channel === 'general') {
    if (txt.includes('giulia')) return 'giulia';
    if (txt.includes('marco')) return 'marco';
    if (txt.includes('sara')) return 'sara';
    if (txt.includes('andrea')) return 'andrea';
    return 'luca'; // default general colleague
  }
  return 'marco';
}

async function triggerAutoReply(channel, userText) {
  const colleagueKey = getColleagueForChannel(channel, userText);
  const colleague = team[colleagueKey];
  if (!colleague) return;

  // Check reply limits for secondary channels
  const isCustomDM = channel === 'dm-sara' || channel === 'dm-marco';
  if (!isCustomDM && channel !== 'welcome' && replyCountPerChannel[channel] >= MAX_REPLIES_SECONDARY) {
    // Send a closing message redirecting to CRM
    await wsDelay(800);
    await showTyping(colleague.name.split(' ')[0], 1000);
    const closing = createMsgHTML(colleague, wsNow(),
      'Dai, ci sentiamo dopo — concentrati sulla pipeline che hai delle cose belle da vedere 💪',
      {}, channel);
    addMsgToChannel(channel, closing, {
      sender: colleagueKey,
      senderName: colleague.name,
      content: 'Dai, ci sentiamo dopo — concentrati sulla pipeline che hai delle cose belle da vedere.'
    });
    replyCountPerChannel[channel] = 999; // prevent further replies
    return;
  }

  replyCountPerChannel[channel]++;

  // Wait a brief moment before starting the typing sequence (mental reaction time)
  await wsDelay(300 + Math.random() * 300);

  let replyText = "";
  let isHandoffTransition = false;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        message: userText,
        history: channelHistory[channel] || [],
        characterKey: colleagueKey
      })
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();
    replyText = data.reply;
    if (replyText.includes('[TRANSITION]')) {
      isHandoffTransition = true;
      replyText = replyText.replace('[TRANSITION]', '').trim();
    }

  } catch (err) {
    console.error('Failed to get dynamic reply from API, falling back to static:', err);
    // Safe fallbacks in case of network/key issues
    let fallbackText = "Ottimo! Concentriamoci sul lavoro e sul CRM adesso.";
    if (channel === 'welcome') {
      const welcomeReplies = [
        'Perfetto! Quando sei pronto, apri il CRM premendo il pulsante sopra.',
        'Grande! Se hai dubbi o domande, chiedimi pure qui.',
        'Ottimo. Ricorda che puoi guardare anche gli altri canali per raccogliere informazioni.'
      ];
      fallbackText = welcomeReplies[Math.floor(Math.random() * welcomeReplies.length)];
    } else if (channel === 'general') {
      fallbackText = "Benvenuto a bordo! In bocca al lupo per la giornata 🤞";
    } else if (channel === 'sales') {
      fallbackText = "Ciao! Ricordati che qualificare bene i lead è fondamentale prima di prenotare la demo.";
    } else if (channel === 'inbound') {
      fallbackText = "Ciao, per le campagne marketing e i lead inbound c'è un bel po' di movimento oggi.";
    }
    replyText = fallbackText;
  }

  // Now, split the replyText by '\n\n' (cascade/double-texting simulation)
  const blocks = replyText
    .split('\n\n')
    .map(b => b.trim())
    .filter(b => b.length > 0);

  // Send blocks sequentially
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    
    // Calculate typing speed based on length (e.g. 15ms per character, min 700ms, max 2200ms)
    const typingDuration = Math.min(2200, Math.max(700, block.length * 15));
    
    wsTypingText.textContent = `${colleague.name.split(' ')[0]} sta scrivendo…`;
    wsTypingBar.style.display = 'flex';
    
    await wsDelay(typingDuration);
    
    wsTypingBar.style.display = 'none';
    
    const replyMsg = createMsgHTML(colleague, wsNow(), block, {}, channel);
    addMsgToChannel(channel, replyMsg, {
      sender: colleagueKey,
      senderName: colleague.name,
      content: block
    });
    
    // Short break between messages to look natural
    if (i < blocks.length - 1) {
      await wsDelay(600 + Math.random() * 400);
    }
  }

  // Handle DM Phase Transitions after the AI's final block is displayed
  if (channel === 'dm-sara' && (isHandoffTransition || replyCountPerChannel['dm-sara'] >= 3)) {
    replyCountPerChannel['dm-sara'] = 999; // lock
    await wsDelay(2500);
    triggerSlackPostHandoff(currentLead);
  } else if (channel === 'dm-marco' && (isHandoffTransition || replyCountPerChannel['dm-marco'] >= 3)) {
    replyCountPerChannel['dm-marco'] = 999; // lock
    await wsDelay(1500);
    await showTyping(team.marco.name, 1500);
    const lastNote = "Grazie mille per questo spunto. Senti, prima di chiudere la simulazione, c'è un'ultima persona che vorrebbe farti qualche domanda: Gabriel, il nostro Founder.";
    const msgLastNote = createMsgHTML(team.marco, wsNow(), lastNote, {}, 'dm-marco');
    addMsgToChannel('dm-marco', msgLastNote, { sender: 'marco', senderName: team.marco.name, content: lastNote });
    await wsDelay(800);

    // Show CTA to Gabriel
    await showTyping(team.marco.name, 1000);
    const ctaId = `ws-cta-gabriel-${Date.now()}`;
    const ctaWrapper = document.createElement('div');
    ctaWrapper.className = 'ws-cta-wrapper';
    ctaWrapper.innerHTML = `
      <div class="ws-cta-banner">
        <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
          <button class="ws-cta-btn" id="${ctaId}">
          Continua con Gabriel →
        </button>
      </div>
    `;
    addMsgToChannel('dm-marco', ctaWrapper);

    const checkClick = (e) => {
      const btn = e.target.closest(`#${ctaId}`);
      if (btn) {
        wsMessages.removeEventListener('click', checkClick);
        triggerFounderReview();
      }
    };
    wsMessages.addEventListener('click', checkClick);
  }
}

// ── Background activity in #general ──
async function runBackgroundActivity() {
  await wsDelay(5000);

  const bg1 = createMsgHTML(team.andrea, '09:03', `Buona fortuna ${candidateName}! 🚀`, {}, 'general');
  addMsgToChannel('general', bg1, { sender: 'andrea', senderName: team.andrea.name, content: `Buona fortuna ${candidateName}! 🚀` });

  await wsDelay(7000);

  const bg2 = createMsgHTML(team.luca, '09:05', 'Qualcuno ha visto il lead di Edil Bianchi? Sembra interessante.', {}, 'general');
  addMsgToChannel('general', bg2, { sender: 'luca', senderName: team.luca.name, content: 'Qualcuno ha visto il lead di Edil Bianchi? Sembra interessante.' });

  await wsDelay(8000);

  const bg3 = createMsgHTML(team.marco, '09:08', 'Team, ricordatevi la sync alle 11:00. Portate i numeri aggiornati 📊', {}, 'general');
  addMsgToChannel('general', bg3, { sender: 'marco', senderName: team.marco.name, content: 'Team, ricordatevi la sync alle 11:00. Portate i numeri aggiornati 📊' });

  await wsDelay(12000);

  // Notification in #inbound
  const ib = createMsgHTML(team.andrea, '09:12', '🔔 Nuovo lead inbound: <em>Costruzioni Verdi Srl</em> ha visitato la pagina prezzi 3 volte oggi.', {}, 'inbound');
  addMsgToChannel('inbound', ib, { sender: 'andrea', senderName: team.andrea.name, content: '🔔 Nuovo lead inbound: Costruzioni Verdi Srl ha visitato la pagina prezzi 3 volte oggi.' });

  await wsDelay(10000);

  // Sales update
  const su = createMsgHTML(team.sara, '09:18', 'Update: Costruzioni Romani ha confermato la demo per domani alle 10:00 🎯', {}, 'sales');
  addMsgToChannel('sales', su, { sender: 'sara', senderName: team.sara.name, content: 'Update: Costruzioni Romani ha confermato la demo per domani alle 10:00 🎯' });
}

// ── Main workspace start ──
async function startSlackPhase() {
  analytics.slackReadStart = Date.now();

  // Get candidate name
  candidateName = analytics.candidate?.firstName || 'Candidato';

  // Personalize sidebar footer
  const initials = candidateName.charAt(0).toUpperCase();
  document.getElementById('ws-user-avatar').textContent = initials;
  document.getElementById('ws-user-name').textContent = candidateName;

  // Pre-populate other channels (silent — no sounds)
  prePopulateChannels();

  // Run welcome sequence + background activity in parallel
  runBackgroundActivity();
  await runWelcomeSequence();
}

// ── Analytics overlay ──
function showAnalytics() {
  const grid = document.getElementById('analytics-grid');
  const items = [
    { label: 'Tempo totale', value: formatTime(analytics.totalTime) },
    { label: 'Video Founder', value: formatTime(analytics.founderWatchTime) },
    { label: 'Lettura Workspace', value: formatTime(analytics.slackReadTime) },
    { label: 'Interazioni', value: String(analytics.interactions) },
  ];
  grid.innerHTML = items
    .map(i => `<div class="analytics-item">
      <div class="analytics-item-label">${i.label}</div>
      <div class="analytics-item-value">${i.value}</div>
    </div>`)
    .join('');
  document.getElementById('analytics-overlay').classList.remove('hidden');
}

document.getElementById('btn-close-analytics').addEventListener('click', () => {
  document.getElementById('analytics-overlay').classList.add('hidden');
});

document.addEventListener('click', () => analytics.interactions++);

async function triggerSlackCallNudge(topLead) {
  channelMessages['dm-marco'] = [];
  channelHistory['dm-marco'] = [];
  lastSenderInChannel['dm-marco'] = '';
  activeChannel = null;

  showPhase('phase-slack');
  // Unlock Marco DM in sidebar
  const marcoDmEl = document.getElementById('ws-dm-marco');
  if (marcoDmEl) marcoDmEl.classList.remove('ws-dm-locked');
  switchChannel('dm-marco');

  // Message 1
  await showTyping(team.marco.name, 1200);
  const m1 = createMsgHTML(team.marco, wsNow(), `Ottimo lavoro con la prioritizzazione. 👍 Hai completato la prima parte della giornata.`, { forceNewBlock: true }, 'dm-marco');
  addMsgToChannel('dm-marco', m1, { sender: 'marco', senderName: team.marco.name, content: 'Ottimo lavoro con la prioritizzazione.' });
  await wsDelay(1200);

  // Message 2
  await showTyping(team.marco.name, 1800);
  const m2 = createMsgHTML(team.marco, wsNow(), `Ora passiamo alla discovery call: il lead che hai indicato come prioritario è <strong>${topLead.company}</strong>.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m2, { sender: 'marco', senderName: team.marco.name, content: `Lead prioritario: ${topLead.company}.` });
  await wsDelay(1500);

  // Message 3
  await showTyping(team.marco.name, 1800);
  const m3 = createMsgHTML(team.marco, wsNow(), `Chiamerai <strong>${topLead.contact.name}</strong>, <strong>${topLead.contact.role}</strong>, per capire se vale la pena portare avanti l’opportunità.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m3, { sender: 'marco', senderName: team.marco.name, content: `Chiama ${topLead.contact.name}.` });
  await wsDelay(1500);

  // Message 4
  await showTyping(team.marco.name, 2500);
  const m4 = createMsgHTML(team.marco, wsNow(), `Se è la tua prima discovery, tieni a mente una cosa: non devi vendere Pillar subito. Parti da ciò che sai già dal CRM, fai domande per capire meglio la situazione e approfondisci quando emerge qualcosa di rilevante.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m4, { sender: 'marco', senderName: team.marco.name, content: `Se è la tua prima discovery, tieni a mente una cosa: non devi vendere Pillar subito.` });
  await wsDelay(1500);

  // Message 5
  await showTyping(team.marco.name, 2200);
  const m5 = createMsgHTML(team.marco, wsNow(), `Non esiste una sequenza di domande obbligatoria: ascolta il prospect, segui la conversazione e raccogli le informazioni che ritieni necessarie per capire quale dovrebbe essere il passo successivo.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m5, { sender: 'marco', senderName: team.marco.name, content: `Non esiste una sequenza di domande obbligatoria. Ascolta il prospect, segui la conversazione...` });
  await wsDelay(1500);

  // Message 6
  await showTyping(team.marco.name, 1400);
  const m6 = createMsgHTML(team.marco, wsNow(), `Al termine della chiamata ti chiederò di aggiornare il CRM con ciò che hai scoperto.<br><br>Buona chiamata! 📞`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m6, { sender: 'marco', senderName: team.marco.name, content: 'Buona chiamata!' });
  await wsDelay(800);

  // CTA
  await showTyping(team.marco.name, 1000);
  const ctaId = `ws-cta-call-${Date.now()}`;
  const ctaWrapper = document.createElement('div');
  ctaWrapper.className = 'ws-cta-wrapper';
  ctaWrapper.innerHTML = `
    <div class="ws-cta-banner">
      <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
      <button class="ws-cta-btn" id="${ctaId}">
        Avvia Chiamata →
      </button>
    </div>
  `;
  addMsgToChannel('dm-marco', ctaWrapper);

  const checkClick = (e) => {
    const btn = e.target.closest(`#${ctaId}`);
    if (btn) {
      wsMessages.removeEventListener('click', checkClick);
      if (typeof window.startDiscoveryCall === 'function') {
        window.startDiscoveryCall(topLead);
      }
    }
  };
  wsMessages.addEventListener('click', checkClick);
}

window.triggerSlackCallNudge = triggerSlackCallNudge;

// ── Post-Discovery Call: return to Slack DM with Qualification CTA ──
async function triggerSlackPostDiscoveryCall(lead) {
  channelMessages['dm-marco'] = [];
  channelHistory['dm-marco'] = [];
  lastSenderInChannel['dm-marco'] = '';
  activeChannel = null;

  showPhase('phase-slack');
  switchChannel('dm-marco');

  // Message 1
  await showTyping(team.marco.name, 1000);
  const m1 = createMsgHTML(team.marco, wsNow(), `Ottimo lavoro. 👏 Hai completato la discovery call.`, { forceNewBlock: true }, 'dm-marco');
  addMsgToChannel('dm-marco', m1, { sender: 'marco', senderName: team.marco.name, content: 'Ottimo lavoro. 👏 Hai completato la discovery call.' });
  await wsDelay(1200);

  // Message 2
  await showTyping(team.marco.name, 1800);
  const m2 = createMsgHTML(team.marco, wsNow(), `Ora è il momento di aggiornare il CRM con quanto emerso dalla conversazione.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m2, { sender: 'marco', senderName: team.marco.name, content: 'Ora è il momento di aggiornare il CRM.' });
  await wsDelay(1500);

  // Message 3
  await showTyping(team.marco.name, 2200);
  const m3 = createMsgHTML(team.marco, wsNow(), `Inserisci le informazioni che ritieni più rilevanti e indica come pensi dovrebbe proseguire l’opportunità.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m3, { sender: 'marco', senderName: team.marco.name, content: 'Inserisci le informazioni che ritieni più rilevanti.' });
  await wsDelay(1500);

  // Message 4
  await showTyping(team.marco.name, 2500);
  const m4 = createMsgHTML(team.marco, wsNow(), `Ricorda: quello che inserirai sarà il punto di partenza per l’Account Executive che prenderà in carico il lead. Il tuo aggiornamento dovrà permettergli di capire rapidamente la situazione e arrivare preparato al prossimo confronto con il prospect.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m4, { sender: 'marco', senderName: team.marco.name, content: 'Il tuo aggiornamento sarà il punto di partenza.' });
  await wsDelay(1500);
  
  // Message 5
  await showTyping(team.marco.name, 1200);
  const m5 = createMsgHTML(team.marco, wsNow(), `Quando sei pronto, aggiorna il CRM.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m5, { sender: 'marco', senderName: team.marco.name, content: 'Quando sei pronto, aggiorna il CRM.' });
  await wsDelay(800);

  // CTA
  await showTyping(team.marco.name, 1000);
  const ctaId = `ws-cta-qual-${Date.now()}`;
  const ctaWrapper = document.createElement('div');
  ctaWrapper.className = 'ws-cta-wrapper';
  ctaWrapper.innerHTML = `
    <div class="ws-cta-banner">
      <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
      <button class="ws-cta-btn" id="${ctaId}">
        Aggiorna CRM →
      </button>
    </div>
  `;
  addMsgToChannel('dm-marco', ctaWrapper);

  const checkClick = (e) => {
    const btn = e.target.closest(`#${ctaId}`);
    if (btn) {
      wsMessages.removeEventListener('click', checkClick);
      showPhase('phase-qualification');
      if (typeof initQualificationCRM === 'function') {
        initQualificationCRM();
      }
    }
  };
  wsMessages.addEventListener('click', checkClick);
}

window.triggerSlackPostDiscoveryCall = triggerSlackPostDiscoveryCall;

// ── Post-Qualification: Marco assigns handoff to Sara ──
async function triggerSlackPostQualification(lead) {
  channelMessages['dm-marco'] = [];
  channelHistory['dm-marco'] = [];
  lastSenderInChannel['dm-marco'] = '';
  activeChannel = null;

  showPhase('phase-slack');
  switchChannel('dm-marco');

  const leadName = lead ? lead.company : 'il lead';

  // Message 1
  await showTyping(team.marco.name, 1200);
  const m1 = createMsgHTML(team.marco, wsNow(), `Ottimo lavoro. 👏 Hai completato la qualification del lead.`, { forceNewBlock: true }, 'dm-marco');
  addMsgToChannel('dm-marco', m1, { sender: 'marco', senderName: team.marco.name, content: 'Ottimo lavoro. 👏' });
  await wsDelay(1200);

  // Message 2
  await showTyping(team.marco.name, 1800);
  const m2 = createMsgHTML(team.marco, wsNow(), `Ora passeremo <strong>${leadName}</strong> a Sara Ricci, Account Executive, che lo prenderà in carico per valutare i prossimi passi.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m2, { sender: 'marco', senderName: team.marco.name, content: 'Passeremo il lead a Sara Ricci.' });
  await wsDelay(1500);

  // Message 3
  await showTyping(team.marco.name, 2200);
  const m3 = createMsgHTML(team.marco, wsNow(), `Prima di procedere, Sara ti chiederà un breve handoff. Avrà già accesso alla qualification che hai appena aggiornato, quindi non servirà ripetere tutto ciò che hai inserito nel CRM.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m3, { sender: 'marco', senderName: team.marco.name, content: 'Sara ti chiederà un breve handoff.' });
  await wsDelay(1500);

  // Message 4
  await showTyping(team.marco.name, 2400);
  const m4 = createMsgHTML(team.marco, wsNow(), `Pensa invece a quali informazioni e quale contesto potrebbero esserle più utili per capire rapidamente la situazione e decidere come muoversi.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m4, { sender: 'marco', senderName: team.marco.name, content: 'Pensa a quali informazioni esserle più utili.' });
  await wsDelay(1500);

  // Message 5
  await showTyping(team.marco.name, 1200);
  const m5 = createMsgHTML(team.marco, wsNow(), `Quando sei pronto, apri la chat con Sara.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m5, { sender: 'marco', senderName: team.marco.name, content: 'Apri la chat con Sara.' });
  await wsDelay(800);

  // CTA
  await showTyping(team.marco.name, 1000);
  const ctaId = `ws-cta-handoff-${Date.now()}`;
  const ctaWrapper = document.createElement('div');
  ctaWrapper.className = 'ws-cta-wrapper';
  ctaWrapper.innerHTML = `
    <div class="ws-cta-banner">
      <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
      <button class="ws-cta-btn" id="${ctaId}">
        Apri chat con Sara →
      </button>
    </div>
  `;
  addMsgToChannel('dm-marco', ctaWrapper);

  const checkClick = (e) => {
    const btn = e.target.closest(`#${ctaId}`);
    if (btn) {
      wsMessages.removeEventListener('click', checkClick);
      triggerSlackHandoffToSara(lead);
    }
  };
  wsMessages.addEventListener('click', checkClick);
}

window.triggerSlackPostQualification = triggerSlackPostQualification;

// ── Handoff: Open Sara DM with her message + composer ──
async function triggerSlackHandoffToSara(lead) {
  currentLead = lead;
  replyCountPerChannel['dm-sara'] = 0;
  channelMessages['dm-sara'] = [];
  channelHistory['dm-sara'] = [];
  lastSenderInChannel['dm-sara'] = '';
  handoffMode = true;
  activeChannel = null;

  // Unlock Sara DM in sidebar
  const saraDmEl = document.getElementById('ws-dm-sara');
  if (saraDmEl) saraDmEl.classList.remove('ws-dm-locked');
  switchChannel('dm-sara');

  const leadName = lead ? lead.company : 'il lead';

  // Sara's message — broken into welcome-style chunks
  await showTyping(team.sara.name, 1200);
  const s1 = createMsgHTML(team.sara, wsNow(), `Ciao ${candidateName}! 👋`, { forceNewBlock: true }, 'dm-sara');
  addMsgToChannel('dm-sara', s1, { sender: 'sara', senderName: team.sara.name, content: `Ciao ${candidateName}! 👋` });
  await wsDelay(1200);

  await showTyping(team.sara.name, 1800);
  const s2 = createMsgHTML(team.sara, wsNow(), `Ho visto che Marco mi ha passato <strong>${leadName}</strong>.`, {}, 'dm-sara');
  addMsgToChannel('dm-sara', s2, { sender: 'sara', senderName: team.sara.name, content: `Marco mi ha passato ${leadName}.` });
  await wsDelay(1500);

  await showTyping(team.sara.name, 2200);
  const s3 = createMsgHTML(team.sara, wsNow(), `Ho dato un’occhiata alla qualification che hai appena aggiornato. Prima di occuparmi del lead, mi prepari un breve handoff?`, {}, 'dm-sara');
  addMsgToChannel('dm-sara', s3, { sender: 'sara', senderName: team.sara.name, content: 'Mi prepari un breve handoff?' });
  await wsDelay(1500);

  await showTyping(team.sara.name, 2500);
  const s4 = createMsgHTML(team.sara, wsNow(), `Non serve ripetere tutto quello che hai già inserito nel CRM: concentrati su ciò che ritieni più importante che sappia sul lead, su cosa è emerso dalla conversazione e su come pensi dovremmo procedere.`, {}, 'dm-sara');
  addMsgToChannel('dm-sara', s4, { sender: 'sara', senderName: team.sara.name, content: 'Concentrati su ciò che è importante.' });
  await wsDelay(1500);

  await showTyping(team.sara.name, 1800);
  const s5 = createMsgHTML(team.sara, wsNow(), `Mi basta avere il contesto necessario per capire rapidamente la situazione e decidere come muovermi.`, {}, 'dm-sara');
  addMsgToChannel('dm-sara', s5, { sender: 'sara', senderName: team.sara.name, content: 'Mi basta avere il contesto necessario.' });
  await wsDelay(1200);

  await showTyping(team.sara.name, 600);
  const s6 = createMsgHTML(team.sara, wsNow(), `Grazie!`, {}, 'dm-sara');
  addMsgToChannel('dm-sara', s6, { sender: 'sara', senderName: team.sara.name, content: 'Grazie!' });

  // Bind handoff composer
  bindHandoffComposer(lead);
}

function bindHandoffComposer(lead) {
  const inputWrapper = document.getElementById('ws-input-wrapper');
  const originalInput = document.getElementById('ws-input');
  const sendBtn = document.getElementById('ws-send');
  if (!inputWrapper || !originalInput || !sendBtn) return;

  // Reuse existing textarea (from switchChannel) or create one
  let textarea = document.getElementById('ws-compose-textarea');
  if (!textarea) {
    originalInput.style.display = 'none';
    textarea = document.createElement('textarea');
    textarea.className = 'ws-input-textarea';
    textarea.id = 'ws-compose-textarea';
    textarea.placeholder = 'Scrivi il tuo recap per Sara…';
    textarea.rows = 1;
    inputWrapper.insertBefore(textarea, sendBtn);
  }
  sendBtn.disabled = true;

  // Auto-grow textarea
  const autoGrow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const onInput = () => {
    autoGrow();
    const text = textarea.value.trim();
    const words = text.length === 0 ? 0 : text.split(/\s+/).length;
    sendBtn.disabled = words < 5 || words > 150;
  };
  textarea.addEventListener('input', onInput);

  // Store send handler for sendCandidateMessage to call
  window._composeOnSend = async () => {
    const text = textarea.value.trim();
    const words = text.split(/\s+/).length;
    if (!text || words < 5 || words > 150) return;

    // Cleanup
    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('keydown', handleEnterKey);
    window._composeOnSend = null;

    // Save analytics
    if (typeof analytics !== 'undefined') {
      analytics.handoffMessage = {
        text,
        wordCount: words,
        prospectId: lead?.id || '',
        submittedAt: Date.now(),
      };
    }

    // Show candidate's message in chat
    const candidateMsg = createMsgHTML(candidateMember, wsNow(), text.replace(/\n/g, '<br>'), { forceNewBlock: true }, 'dm-sara');
    addMsgToChannel('dm-sara', candidateMsg, { own: true, silent: true, sender: 'user', senderName: candidateMember.name, content: text });
    playSendSound();

    // Restore normal input
    handoffMode = false;
    textarea.remove();
    originalInput.style.display = '';
    originalInput.value = '';
    sendBtn.disabled = true;

    // Sara replies contextually via AI
    await wsDelay(1000);
    let replyText = "Perfetto, grazie! Ho tutto quello che mi serve per preparare la demo. 👍";
    let isHandoffTransition = false;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'dm-sara',
          message: `Ecco il mio handoff/recap della discovery call per il lead ${lead?.company || 'Pillar'}:\n\n${text}`,
          history: channelHistory['dm-sara'] || [],
          characterKey: 'sara'
        })
      });
      if (response.ok) {
        const data = await response.json();
        replyText = data.reply;
        if (replyText.includes('[TRANSITION]')) {
          isHandoffTransition = true;
          replyText = replyText.replace('[TRANSITION]', '').trim();
        }
      }
    } catch (err) {
      console.error("Sara AI reply failed:", err);
    }

    const blocks = replyText
      .split('\n\n')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    for (let i = 0; i < blocks.length; i++) {
      await showTyping(team.sara.name, 1000 + Math.min(blocks[i].length * 12, 2000));
      const opts = i === 0 ? { forceNewBlock: true } : {};
      const msg = createMsgHTML(team.sara, wsNow(), blocks[i], opts, 'dm-sara');
      addMsgToChannel('dm-sara', msg, { sender: 'sara', senderName: team.sara.name, content: blocks[i] });
      if (i < blocks.length - 1) await wsDelay(1000 + Math.random() * 500);
    }

    if (isHandoffTransition) {
      replyCountPerChannel['dm-sara'] = 999;
      await wsDelay(2500);
      triggerSlackPostHandoff(lead);
    } else {
      replyCountPerChannel['dm-sara'] = 1;
    }
  };

  // Bind Enter key on textarea
  textarea.addEventListener('keydown', handleEnterKey);
  textarea.focus();
}

// ── Post-Handoff: Builder Mindset ──
async function triggerSlackPostHandoff(lead) {
  replyCountPerChannel['dm-marco'] = 0;
  channelMessages['dm-marco'] = [];
  channelHistory['dm-marco'] = [];
  lastSenderInChannel['dm-marco'] = '';
  builderMode = true;
  activeChannel = null;

  switchChannel('dm-marco');

  // Message 1
  await showTyping(team.marco.name, 1000);
  const m1 = createMsgHTML(team.marco, wsNow(), `Ottimo lavoro.`, { forceNewBlock: true }, 'dm-marco');
  addMsgToChannel('dm-marco', m1, { sender: 'marco', senderName: team.marco.name, content: 'Ottimo lavoro.' });
  await wsDelay(1200);

  // Message 2
  await showTyping(team.marco.name, 1400);
  const m2 = createMsgHTML(team.marco, wsNow(), `Hai completato tutte le attività operative della giornata. 👏`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m2, { sender: 'marco', senderName: team.marco.name, content: 'Tutte le attività completate.' });
  await wsDelay(1200);

  // Message 3
  await showTyping(team.marco.name, 1200);
  const m3 = createMsgHTML(team.marco, wsNow(), `Prima di chiudere però vorrei chiederti una cosa.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m3, { sender: 'marco', senderName: team.marco.name, content: 'Vorrei chiederti una cosa.' });
  await wsDelay(1500);

  // Message 4
  await showTyping(team.marco.name, 2000);
  const m4 = createMsgHTML(team.marco, wsNow(), `Essendo una startup miglioriamo continuamente il nostro modo di lavorare.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m4, { sender: 'marco', senderName: team.marco.name, content: 'Miglioriamo continuamente.' });
  await wsDelay(1200);

  // Message 5
  await showTyping(team.marco.name, 2400);
  const m5 = createMsgHTML(team.marco, wsNow(), `Hai appena utilizzato il nostro CRM, gestito una discovery call, compilato la qualification e preparato l'handoff per l'Account Executive.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m5, { sender: 'marco', senderName: team.marco.name, content: 'Hai usato tutto il nostro processo.' });
  await wsDelay(1200);

  // Message 6
  await showTyping(team.marco.name, 1000);
  const m6 = createMsgHTML(team.marco, wsNow(), `Mi interessa capire il tuo punto di vista.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m6, { sender: 'marco', senderName: team.marco.name, content: 'Il tuo punto di vista.' });
  await wsDelay(1500);

  // Message 7
  await showTyping(team.marco.name, 2200);
  const m7 = createMsgHTML(team.marco, wsNow(), `Se iniziassi a lavorare con noi lunedì mattina, quali sarebbero le prime cose che proveresti a migliorare nel nostro processo commerciale?`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m7, { sender: 'marco', senderName: team.marco.name, content: 'Cosa miglioreresti?' });
  await wsDelay(1200);

  // Message 8
  await showTyping(team.marco.name, 1400);
  const m8 = createMsgHTML(team.marco, wsNow(), `Non cerco risposte perfette.<br>Mi interessa capire come osservi un processo e come ragioni.`, {}, 'dm-marco');
  addMsgToChannel('dm-marco', m8, { sender: 'marco', senderName: team.marco.name, content: 'Come ragioni.' });

  // Bind builder composer
  bindBuilderComposer(lead);
}

function bindBuilderComposer(lead) {
  const inputWrapper = document.getElementById('ws-input-wrapper');
  const originalInput = document.getElementById('ws-input');
  const sendBtn = document.getElementById('ws-send');
  if (!inputWrapper || !originalInput || !sendBtn) return;

  // Reuse existing textarea or create one
  let textarea = document.getElementById('ws-compose-textarea');
  if (!textarea) {
    originalInput.style.display = 'none';
    textarea = document.createElement('textarea');
    textarea.className = 'ws-input-textarea';
    textarea.id = 'ws-compose-textarea';
    textarea.placeholder = 'Condividi fino a tre miglioramenti concreti che introdurresti…';
    textarea.rows = 1;
    inputWrapper.insertBefore(textarea, sendBtn);
  }
  sendBtn.disabled = true;

  const autoGrow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const onInput = () => {
    autoGrow();
    const text = textarea.value.trim();
    const words = text.length === 0 ? 0 : text.split(/\s+/).length;
    sendBtn.disabled = words < 5 || words > 300;
  };
  textarea.addEventListener('input', onInput);

  window._composeOnSend = async () => {
    const text = textarea.value.trim();
    const words = text.split(/\s+/).length;
    if (!text || words < 5 || words > 300) return;

    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('keydown', handleEnterKey);
    window._composeOnSend = null;

    // Analytics
    if (typeof analytics !== 'undefined') {
      analytics.builderMindset = {
        text,
        wordCount: words,
        submittedAt: Date.now(),
      };
    }

    // Show candidate message
    const candidateMsg = createMsgHTML(candidateMember, wsNow(), text.replace(/\n/g, '<br>'), { forceNewBlock: true }, 'dm-marco');
    addMsgToChannel('dm-marco', candidateMsg, { own: true, silent: true, sender: 'user', senderName: candidateMember.name, content: text });
    playSendSound();

    // Restore normal input
    builderMode = false;
    textarea.remove();
    originalInput.style.display = '';
    originalInput.value = '';
    sendBtn.disabled = true;

    // Marco replies contextually via AI
    await wsDelay(1000);
    let replyText = "Perfetto. Grazie per il feedback, lo leggeremo con attenzione.\n\nC'è ancora un'ultima persona che vorrebbe fare due chiacchiere con te prima di concludere.";
    let isHandoffTransition = false;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'dm-marco',
          message: `Ecco le mie proposte su cosa proverei a migliorare nel nostro processo commerciale di Pillar:\n\n${text}`,
          history: channelHistory['dm-marco'] || [],
          characterKey: 'marco'
        })
      });
      if (response.ok) {
        const data = await response.json();
        replyText = data.reply;
        if (replyText.includes('[TRANSITION]')) {
          isHandoffTransition = true;
          replyText = replyText.replace('[TRANSITION]', '').trim();
        }
      }
    } catch (err) {
      console.error("Marco AI reply failed:", err);
    }

    const blocks = replyText
      .split('\n\n')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    for (let i = 0; i < blocks.length; i++) {
      await showTyping(team.marco.name, 1000 + Math.min(blocks[i].length * 12, 2000));
      const opts = i === 0 ? { forceNewBlock: true } : {};
      const msg = createMsgHTML(team.marco, wsNow(), blocks[i], opts, 'dm-marco');
      addMsgToChannel('dm-marco', msg, { sender: 'marco', senderName: team.marco.name, content: blocks[i] });
      if (i < blocks.length - 1) await wsDelay(1000 + Math.random() * 500);
    }

    if (isHandoffTransition) {
      replyCountPerChannel['dm-marco'] = 999;
      // Show Gabriel review transition banner/note and button
      await wsDelay(1500);
      await showTyping(team.marco.name, 1500);
      const lastNote = "Grazie mille per questo spunto. Senti, prima di chiudere la simulazione, c'è un'ultima persona che vorrebbe farti qualche domanda: Gabriel, il nostro Founder.";
      const msgLastNote = createMsgHTML(team.marco, wsNow(), lastNote, {}, 'dm-marco');
      addMsgToChannel('dm-marco', msgLastNote, { sender: 'marco', senderName: team.marco.name, content: lastNote });
      await wsDelay(800);

      // Show CTA to Gabriel
      await showTyping(team.marco.name, 1000);
      const ctaId = `ws-cta-gabriel-${Date.now()}`;
      const ctaWrapper = document.createElement('div');
      ctaWrapper.className = 'ws-cta-wrapper';
      ctaWrapper.innerHTML = `
        <div class="ws-cta-banner">
          <img decoding="sync" src="pillar-icon-only.png" alt="Pillar" style="height:18px;width:auto;border-radius:3px;">
          <button class="ws-cta-btn" id="${ctaId}">
            Continua con Gabriel →
          </button>
        </div>
      `;
      addMsgToChannel('dm-marco', ctaWrapper);

      const checkClick = (e) => {
        const btn = e.target.closest(`#${ctaId}`);
        if (btn) {
          wsMessages.removeEventListener('click', checkClick);
          triggerFounderReview();
        }
      };
      wsMessages.addEventListener('click', checkClick);
    } else {
      replyCountPerChannel['dm-marco'] = 1;
    }
  };

  // Bind Enter key on textarea
  textarea.addEventListener('keydown', handleEnterKey);
  textarea.focus();
}

// ══════════════════════════════════════════
// FASE 8 — Founder Review (AI Conversation)
// ══════════════════════════════════════════

async function triggerFounderReview() {
  channelMessages['dm-gabriel'] = [];
  channelHistory['dm-gabriel'] = [];
  lastSenderInChannel['dm-gabriel'] = '';
  founderConversation = [];
  founderMode = true;
  activeChannel = null;

  // Unlock Gabriel DM
  const gabrielDmEl = document.getElementById('ws-dm-gabriel');
  if (gabrielDmEl) gabrielDmEl.classList.remove('ws-dm-locked');
  switchChannel('dm-gabriel');

  // Intro messages — one by one
  const introLines = [
    'Ciao! 👋',
    'Ho seguito tutta la tua simulazione.',
    'Prima di salutarci vorrei dedicare qualche minuto a capire come hai vissuto questa esperienza.',
    'Per me non conta soltanto il risultato finale.',
    'Mi interessa soprattutto il modo in cui ragioni quando prendi decisioni.',
    'Non esistono risposte giuste o sbagliate.',
    'Rispondi semplicemente nel modo più autentico possibile.',
  ];

  for (let i = 0; i < introLines.length; i++) {
    const delay = 800 + Math.min(introLines[i].length * 15, 2000);
    await showTyping(team.gabriel.name, delay);
    const opts = i === 0 ? { forceNewBlock: true } : {};
    const msg = createMsgHTML(team.gabriel, wsNow(), introLines[i], opts, 'dm-gabriel');
    addMsgToChannel('dm-gabriel', msg, { sender: 'gabriel', senderName: team.gabriel.name, content: introLines[i] });
    founderConversation.push({ role: 'assistant', content: introLines[i] });
    await wsDelay(600 + Math.random() * 400);
  }

  // Start AI question loop
  await askFounderQuestion();
}

// Build context summary from analytics for the AI
function buildAnalyticsContext() {
  const parts = [];
  if (analytics.leadPriority && analytics.leadPriority.length) {
    parts.push(`Lead prioritizzati (in ordine): ${analytics.leadPriority.map((l, i) => `${i + 1}. ${l.company}`).join(', ')}`);
  }
  if (analytics.callTranscript) {
    parts.push(`Trascrizione della Discovery Call:\n${analytics.callTranscript}`);
  }
  if (analytics.qualification) {
    const q = analytics.qualification;
    parts.push(`Qualification compilata — Problema: ${q.problem || 'N/A'}, Decision maker: ${q.decisionMaker || 'N/A'}, Budget: ${q.budget || 'N/A'}, Tempistiche: ${q.timeline || 'N/A'}, Prossimo step: ${q.nextStep || 'N/A'}`);
  }
  if (analytics.handoffMessage) {
    parts.push(`Handoff a Sara Ricci (Account Executive): "${analytics.handoffMessage.text?.substring(0, 200)}..."`);
  }
  if (analytics.builderMindset) {
    parts.push(`Builder Mindset (miglioramenti proposti): "${analytics.builderMindset.text?.substring(0, 200)}..."`);
  }
  if (analytics.candidateMessages && analytics.candidateMessages.length) {
    parts.push(`Il candidato ha inviato ${analytics.candidateMessages.length} messaggi nei canali Slack durante la simulazione.`);
  }
  return parts.join('\n');
}

let founderQuestionCount = 0;
const FOUNDER_MAX_QUESTIONS = 4;

async function askFounderQuestion() {
  founderQuestionCount++;

  if (founderQuestionCount > FOUNDER_MAX_QUESTIONS) {
    await closeFounderReview();
    return;
  }

  try {
    const contextSummary = buildAnalyticsContext();
    const response = await fetch('/api/founder-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation: founderConversation,
        questionNumber: founderQuestionCount,
        totalQuestions: FOUNDER_MAX_QUESTIONS,
        analyticsContext: contextSummary,
        candidateName: candidateName,
      }),
    });

    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    const questionText = data.reply;

    // Display Gabriel's question
    await wsDelay(800);
    await showTyping(team.gabriel.name, 1200 + Math.min(questionText.length * 12, 2500));
    const qMsg = createMsgHTML(team.gabriel, wsNow(), questionText, { forceNewBlock: true }, 'dm-gabriel');
    addMsgToChannel('dm-gabriel', qMsg, { sender: 'gabriel', senderName: team.gabriel.name, content: questionText });
    founderConversation.push({ role: 'assistant', content: questionText });

  } catch (err) {
    console.error('Founder question API error:', err);
    // Fallback questions
    const fallbacks = [
      'Perché hai scelto proprio quel lead come priorità?',
      'Qual è stato il momento più difficile della simulazione?',
      'C\'è una decisione che oggi prenderesti in modo diverso?',
      'Quale parte della discovery ritieni sia andata meglio?',
      'Quale informazione avresti voluto avere ma non avevi?',
      'Qual è la qualità che pensi possa aiutarti di più in una startup come Pillar?',
    ];
    const q = fallbacks[founderQuestionCount - 1] || fallbacks[0];
    await wsDelay(800);
    await showTyping(team.gabriel.name, 1500);
    const qMsg = createMsgHTML(team.gabriel, wsNow(), q, { forceNewBlock: true }, 'dm-gabriel');
    addMsgToChannel('dm-gabriel', qMsg, { sender: 'gabriel', senderName: team.gabriel.name, content: q });
    founderConversation.push({ role: 'assistant', content: q });
  }

  // Enable candidate input
  bindFounderComposer();
}

function bindFounderComposer() {
  const inputWrapper = document.getElementById('ws-input-wrapper');
  const originalInput = document.getElementById('ws-input');
  const sendBtn = document.getElementById('ws-send');
  if (!inputWrapper || !originalInput || !sendBtn) return;

  // Reuse or create textarea
  let textarea = document.getElementById('ws-compose-textarea');
  if (!textarea) {
    originalInput.style.display = 'none';
    textarea = document.createElement('textarea');
    textarea.className = 'ws-input-textarea';
    textarea.id = 'ws-compose-textarea';
    textarea.placeholder = 'Rispondi a Gabriel…';
    textarea.rows = 1;
    inputWrapper.insertBefore(textarea, sendBtn);
  }
  textarea.value = '';
  sendBtn.disabled = true;

  const autoGrow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const onInput = () => {
    autoGrow();
    const text = textarea.value.trim();
    const words = text.length === 0 ? 0 : text.split(/\s+/).length;
    sendBtn.disabled = words < 3;
  };
  textarea.addEventListener('input', onInput);

  window._composeOnSend = async () => {
    const text = textarea.value.trim();
    if (!text || text.split(/\s+/).length < 3) return;

    // Cleanup
    textarea.removeEventListener('input', onInput);
    window._composeOnSend = null;

    // Show candidate message
    const candidateMsg = createMsgHTML(candidateMember, wsNow(), text.replace(/\n/g, '<br>'), { forceNewBlock: true }, 'dm-gabriel');
    addMsgToChannel('dm-gabriel', candidateMsg, { own: true, silent: true, sender: 'user', senderName: candidateMember.name, content: text });
    playSendSound();
    founderConversation.push({ role: 'user', content: text });

    // Save to analytics
    if (!analytics.founderReview) analytics.founderReview = [];
    analytics.founderReview.push({ question: founderQuestionCount, answer: text, time: Date.now() });

    // Reset textarea
    textarea.value = '';
    sendBtn.disabled = true;

    // Ask next question or close
    await askFounderQuestion();
  };

  textarea.addEventListener('keydown', handleEnterKey);
  textarea.focus();
}

async function closeFounderReview() {
  window._composeOnSend = null;

  // Remove compose textarea
  const composeTextarea = document.getElementById('ws-compose-textarea');
  if (composeTextarea) composeTextarea.remove();
  const originalInput = document.getElementById('ws-input');
  if (originalInput) originalInput.style.display = '';
  founderMode = false;

  // Closing messages
  await wsDelay(1500);
  await showTyping(team.gabriel.name, 1000);
  const c1 = createMsgHTML(team.gabriel, wsNow(), `Perfetto.`, { forceNewBlock: true }, 'dm-gabriel');
  addMsgToChannel('dm-gabriel', c1, { sender: 'gabriel', senderName: team.gabriel.name, content: 'Perfetto.' });
  await wsDelay(1200);

  await showTyping(team.gabriel.name, 1800);
  const c2 = createMsgHTML(team.gabriel, wsNow(), `Ti ringrazio davvero per il tempo che ci hai dedicato oggi.`, {}, 'dm-gabriel');
  addMsgToChannel('dm-gabriel', c2, { sender: 'gabriel', senderName: team.gabriel.name, content: 'Grazie per il tempo dedicato.' });
  await wsDelay(1200);

  await showTyping(team.gabriel.name, 1000);
  const c3 = createMsgHTML(team.gabriel, wsNow(), `In bocca al lupo! 🚀`, {}, 'dm-gabriel');
  addMsgToChannel('dm-gabriel', c3, { sender: 'gabriel', senderName: team.gabriel.name, content: 'In bocca al lupo! 🚀' });

  // ── Silently save session to server for recruiter dashboard ──
  analytics.totalTime = Date.now() - analytics.startTime;
  try {
    if (typeof window.getCallRecording === 'function') {
      const b64Audio = await window.getCallRecording();
      if (b64Audio && analytics.call) {
        analytics.call.audioRecording = b64Audio;
      }
    }
    await fetch('/api/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analytics }),
    });
    console.log('📊 Session saved to recruiter dashboard');
  } catch (e) {
    console.warn('⚠️ Failed to save session:', e.message);
  }
}

// ── Start ──
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(runBoot, 200);
});
