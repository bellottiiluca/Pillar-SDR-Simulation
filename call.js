/* ══════════════════════════════════════════
   Alpha × Pillar — FASE 3: DISCOVERY CALL
   Voice-based conversation with AI prospect
   + Qualification form
   ══════════════════════════════════════════ */

// ── Call State ──
let callProspect = null;       // lead data from CRM
let callActive = false;
let callSession = null;
let callTimerSeconds = 0;
let callTimerInterval = null;
let callExchangeCount = 0;
let callMessages = [];         // { role: 'user'|'assistant', content, timestamp }
let callRecognition = null;    // Web Speech API instance
let callIsListening = false;
let callIsSpeaking = false;
let callCurrentAudio = null;   // currently playing TTS audio
let callUseSpeech = false;     // whether Web Speech API is available
let callEnded = false;

// ── WebRTC State ──
let callPeerConnection = null;
let callDataChannel = null;
let callLocalStream = null;
let callUseWebRTC = false;
let callProspectMessageCount = 0;
let callActiveSystemPrompt = "";

// Recording states
let callMediaRecorder = null;
let callRecordedChunks = [];
let callRecordingPromise = null;
let callRecordingResolve = null;

window.getCallRecording = () => {
  if (callRecordingPromise) return callRecordingPromise;
  return Promise.resolve(null);
};
let callScreenVisible = false;
let callGreetingTriggered = false;
let callLastUserSpeechStoppedTime = 0;
let callFirstAudioDeltaLogged = false;
let triggerGreetingIfReady = null;

function logToServer(type, message, data = null) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, data })
  }).catch(() => {});
}

// ── Discovery Progress State ──
const DISCOVERY_FIELDS = ['pain', 'budget', 'decision_maker', 'timeline', 'current_process', 'priority', 'next_steps'];
let discoveredFields = {};

// ── Voice map for TTS per prospect ──
const PROSPECT_VOICES = {
  ferraro: 'echo',
  marchetti: 'onyx',
  greenbuild: 'shimmer',
  parisi: 'fable',
  rossi: 'nova',
};

// ══════════════════════════════════════════
// BACKGROUND AMBIENT SOUND LOOPS
// ══════════════════════════════════════════
let callBgAmbientAudio = null;

function playBgAmbient(leadId) {
  try {
    if (callBgAmbientAudio) {
      callBgAmbientAudio.pause();
      callBgAmbientAudio = null;
    }

    let filename = '';
    let volume = 0.08;

    if (leadId === 'marchetti' || leadId === 'ferraro') {
      filename = 'sound-construction.mp3';
      volume = 0.06; // subtle construction sound, not overwhelming
    } else {
      filename = 'sound-office.mp3';
      volume = leadId === 'rossi' ? 0.04 : 0.09; // lower volume for Rossi's quiet office
    }

    callBgAmbientAudio = new Audio(filename);
    callBgAmbientAudio.loop = true;
    callBgAmbientAudio.volume = volume;
    
    callBgAmbientAudio.play().catch(e => {
      console.log('[Audio] Ambient playback blocked by browser policy:', e.message);
    });
  } catch (err) {
    console.error('[Audio] Failed to initialize ambient background:', err.message);
  }
}

function stopBgAmbient() {
  try {
    if (callBgAmbientAudio) {
      callBgAmbientAudio.pause();
      callBgAmbientAudio = null;
    }
  } catch (err) {
    console.error('[Audio] Failed to stop ambient background:', err.message);
  }
}

// ══════════════════════════════════════════
// RING SOUND — Web Audio API
// ══════════════════════════════════════════
function playRingSound() {
  try {
    const ctx = getSndCtx();
    const now = ctx.currentTime;

    // Two-tone ring pattern (like a real phone)
    for (let cycle = 0; cycle < 2; cycle++) {
      const offset = cycle * 1.0;
      [0, 0.15, 0.30].forEach((t, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = i % 2 === 0 ? 440 : 480;
        gain.gain.setValueAtTime(0.06, now + offset + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + t + 0.12);
        osc.start(now + offset + t);
        osc.stop(now + offset + t + 0.15);
      });
    }
  } catch (e) { /* ignore audio errors */ }
}

// ══════════════════════════════════════════
// CONNECTING SCREEN
// ══════════════════════════════════════════
function showConnectingScreen(lead) {
  // Initialize call state variables immediately
  callProspect = lead;
  callActive = true;
  callEnded = false;
  callSession = null; // ElevenLabs Session
  callTimerSeconds = 0;
  callExchangeCount = 0;
  callMessages = [];
  callProspectMessageCount = 0;

  // Reset WebRTC greeting timing synchronization variables
  callScreenVisible = false;
  callGreetingTriggered = false;
  triggerGreetingIfReady = null;

  // Reset discovery state
  discoveredFields = {};
  DISCOVERY_FIELDS.forEach(f => discoveredFields[f] = false);

  // Non avviamo la connessione immediatamente (come facevamo con WebRTC)
  // altrimenti ElevenLabs è così veloce che risponderebbe durante i finti squilli!

  const initials = lead.contact.name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase();

  // Populate connecting screen
  document.getElementById('call-connecting-initials').style.display = 'none';
  document.getElementById('call-connecting-avatar-circle').style.background = `url('avatar-${lead.id}.jpg') center/cover no-repeat`;
  document.getElementById('call-connecting-name').textContent = lead.contact.name;
  document.getElementById('call-connecting-role').textContent = lead.contact.role;
  document.getElementById('call-connecting-company').textContent = lead.company;
  document.getElementById('call-connecting-status').textContent = 'Avvio chiamata...';

  // Show connecting overlay
  const connectingEl = document.getElementById('call-connecting');
  const statusEl = document.getElementById('call-connecting-status');
  const avatarCircle = document.getElementById('call-connecting-avatar-circle');
  connectingEl.classList.add('active');

  // Play ring sound
  playRingSound();

  // Progressive status
  setTimeout(() => {
    statusEl.textContent = 'Squilla...';
  }, 900);

  // Second ring cycle
  setTimeout(() => {
    playRingSound();
  }, 2000);

  // Third ring cycle
  setTimeout(() => {
    playRingSound();
    
    // Ora avviamo l'agente ElevenLabs a 3 secondi esatti.
    // Dalle tue prove, la connessione impiega circa 2.5/3 secondi per attivarsi.
    // In questo modo si sincronizzerà in modo impeccabile col secondo 6!
    startElevenLabsCall(lead);
  }, 3000);

  // Connected state
  setTimeout(() => {
    statusEl.textContent = 'Connesso';
    statusEl.classList.add('call-status-connected');
    avatarCircle.classList.add('call-connected-flash');
  }, 5200);

  // Transition to call UI
  setTimeout(() => {
    connectingEl.classList.remove('active');
    statusEl.classList.remove('call-status-connected');
    avatarCircle.classList.remove('call-connected-flash');
    document.getElementById('call-container').style.display = 'flex';
    startCallUI(lead);

    // Coordinate greeting triggers
    callScreenVisible = true;
    if (typeof triggerGreetingIfReady === 'function') {
      console.log("[WebRTC] Call screen now visible, firing ready greeting");
      triggerGreetingIfReady();
    }
  }, 6000);
}

// ══════════════════════════════════════════
// CALL UI — Initialize and populate
// ══════════════════════════════════════════
function startCallUI(lead) {
  const initials = lead.contact.name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase();

  // Play environmental background ambient loop (subtle office/construction site noises)
  playBgAmbient(lead.id);

  // Populate hero center
  document.getElementById('call-prospect-initials').style.display = 'none';
  document.getElementById('call-prospect-avatar').style.background = `url('avatar-${lead.id}.jpg') center/cover no-repeat`;
  document.getElementById('call-prospect-name').textContent = lead.contact.name;
  document.getElementById('call-prospect-role').textContent = lead.contact.role;
  document.getElementById('call-prospect-company').textContent = lead.company;

  // Set lead color on waveform (hardcoded to premium blue '#6366f1' for brand consistency)
  const waveform = document.getElementById('call-waveform');
  if (waveform) {
    waveform.style.setProperty('--lead-color', '#6366f1');
  }

  // Populate topbar
  const topbarTimer = document.getElementById('call-timer-text');
  if (topbarTimer) topbarTimer.textContent = '00:00';
  const heroTimer = document.getElementById('call-hero-timer');
  if (heroTimer) heroTimer.textContent = '00:00';
  if (typeof candidateName !== 'undefined' && candidateName) {
    document.getElementById('call-user-avatar').textContent = candidateName.charAt(0).toUpperCase();
  }

  // Populate CRM + Discovery panels
  populateCallPanels(lead);

  // Init waveform as silent
  const wf = document.getElementById('call-waveform');
  if (wf) wf.className = 'call-waveform silent';

  // Show call container
  document.getElementById('call-container').style.display = 'flex';

  // Clear hidden transcript
  document.getElementById('call-chat').innerHTML = '';

  // Start timer (count up) — sync topbar + hero timer
  callTimerInterval = setInterval(() => {
    callTimerSeconds++;
    const m = Math.floor(callTimerSeconds / 60);
    const s = callTimerSeconds % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const topbarTimer = document.getElementById('call-timer-text');
    if (topbarTimer) topbarTimer.textContent = timeStr;
    const ht = document.getElementById('call-hero-timer');
    if (ht) ht.textContent = timeStr;
  }, 1000);

  // Init analytics
  initCallAnalytics(lead);

  // Bind call controls
  bindCallControls();
}

// ══════════════════════════════════════════
// PANEL POPULATION — Left CRM + Right Intelligence
// ══════════════════════════════════════════
function populateCallPanels(lead) {
  const initials = lead.contact.name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase();

  // ── LEFT PANEL: CRM ──
  // Prospect header
  const crmAvatar = document.getElementById('call-crm-avatar');
  if (crmAvatar) {
    crmAvatar.style.background = lead.avatarColor;
    document.getElementById('call-crm-initials').textContent = initials;
  }
  const crmName = document.getElementById('call-crm-name');
  if (crmName) crmName.textContent = lead.contact.name;
  const crmRole = document.getElementById('call-crm-role');
  if (crmRole) crmRole.textContent = lead.contact.role;
  const crmCompany = document.getElementById('call-crm-company');
  if (crmCompany) crmCompany.textContent = lead.company;

  // Info grid
  const grid = document.getElementById('call-crm-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="call-crm-grid-item">
        <span class="call-crm-grid-label">Azienda</span>
        <span class="call-crm-grid-value">${lead.company}</span>
      </div>
      <div class="call-crm-grid-item">
        <span class="call-crm-grid-label">Settore</span>
        <span class="call-crm-grid-value">${lead.sector}</span>
      </div>
      <div class="call-crm-grid-item">
        <span class="call-crm-grid-label">Dipendenti</span>
        <span class="call-crm-grid-value">${lead.employees}</span>
      </div>
      <div class="call-crm-grid-item">
        <span class="call-crm-grid-label">Fonte</span>
        <span class="call-crm-grid-value">${lead.source.icon} ${lead.source.type}</span>
      </div>
    `;
  }

  // Activity timeline
  const timeline = document.getElementById('call-crm-timeline');
  if (timeline) {
    timeline.innerHTML = lead.activities.map(a => `
      <div class="call-crm-timeline-item">
        <span class="call-crm-timeline-icon">${a.icon}</span>
        <span class="call-crm-timeline-text">${a.text}</span>
      </div>
    `).join('');
  }

  // Clear live notes
  const notes = document.getElementById('call-live-notes');
  if (notes) notes.value = '';

  // ── RIGHT PANEL: Intelligence ──
  // Reset discovery checkboxes
  document.querySelectorAll('.call-discovery-item').forEach(item => {
    item.classList.remove('discovered');
  });

  // Reset completeness bar
  updateDiscoveryUI();
}

// ══════════════════════════════════════════
// SPEECH RECOGNITION (Web Speech API)
// ══════════════════════════════════════════
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.log('🎤 Web Speech API not supported — using text fallback');
    callUseSpeech = false;
    showTextInput();
    return;
  }

  callUseSpeech = true;
  callRecognition = new SpeechRecognition();
  callRecognition.lang = 'it-IT';
  callRecognition.interimResults = true;
  callRecognition.continuous = false;
  callRecognition.maxAlternatives = 1;

  callRecognition.onresult = (event) => {
    let transcript = '';
    let isFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        isFinal = true;
      }
    }

    // Show interim results
    updateListeningText(transcript, !isFinal);

    if (isFinal && transcript.trim()) {
      stopListening();
      handleCandidateMessage(transcript.trim());
    }
  };

  callRecognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      // Permission denied — fall back to text
      callUseSpeech = false;
      showTextInput();
      hideListeningIndicator();
    } else if (event.error === 'no-speech') {
      // No speech detected — restart
      if (callActive && !callIsSpeaking && !callEnded) {
        startListening();
      }
    }
  };

  callRecognition.onend = () => {
    callIsListening = false;
    if (callActive && !callIsSpeaking && !callEnded) {
      // Auto-restart listening
      setTimeout(() => {
        if (callActive && !callIsSpeaking && !callEnded) {
          startListening();
        }
      }, 300);
    }
  };
}

function startListening() {
  if (!callUseSpeech || !callRecognition || callIsListening || callIsSpeaking || callEnded) return;

  try {
    callRecognition.start();
    callIsListening = true;
    showListeningIndicator();
  } catch (e) {
    // Recognition might already be running
    console.warn('Recognition start error:', e);
  }
}

function stopListening() {
  if (!callRecognition) return;
  try {
    callRecognition.stop();
  } catch (e) { /* ignore */ }
  callIsListening = false;
  hideListeningIndicator();
}

function showListeningIndicator() {
  const el = document.getElementById('call-listening');
  if (el) el.classList.add('active');
}

function hideListeningIndicator() {
  const el = document.getElementById('call-listening');
  if (el) el.classList.remove('active');
}

function updateListeningText(text, isInterim) {
  // Show interim transcript in the chat as a preview
  let preview = document.getElementById('call-interim-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'call-interim-preview';
    preview.className = 'call-msg candidate interim';
    document.getElementById('call-chat').appendChild(preview);
  }
  preview.innerHTML = `
    <span class="call-msg-label">Tu</span>
    <span class="call-msg-text">${text}${isInterim ? '<span class="call-interim-cursor">|</span>' : ''}</span>
  `;
  scrollCallChat();
}

function removeInterimPreview() {
  const preview = document.getElementById('call-interim-preview');
  if (preview) preview.remove();
}

// ══════════════════════════════════════════
// TEXT INPUT FALLBACK
// ══════════════════════════════════════════
function showTextInput() {
  const inputArea = document.getElementById('call-input-area');
  if (inputArea) inputArea.classList.add('visible');

  // Hide listening indicator
  hideListeningIndicator();

  const input = document.getElementById('call-input');
  const sendBtn = document.getElementById('call-send-btn');

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', sendTextMessage);
  }
}

function sendTextMessage() {
  const input = document.getElementById('call-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text || callIsSpeaking || callEnded) return;

  input.value = '';
  handleCandidateMessage(text);
}

// ══════════════════════════════════════════
// MESSAGE HANDLING
// ══════════════════════════════════════════
function handleCandidateMessage(text) {
  if (!callActive || callEnded) return;

  // Remove interim preview
  removeInterimPreview();

  // Add message to chat
  addCallMessage('candidate', text);

  // Track
  callMessages.push({ role: 'user', content: text, timestamp: Date.now() });
  callExchangeCount++;

  // Update analytics
  if (typeof analytics !== 'undefined' && analytics.call) {
    analytics.call.candidateWordCount += text.split(/\s+/).length;
    analytics.call.exchangeCount = callExchangeCount;

    // Detect product mention
    if (analytics.call.productMentionExchange === -1) {
      const lower = text.toLowerCase();
      if (lower.includes('pillar') || lower.includes('software') || lower.includes('piattaforma') || lower.includes('soluzione')) {
        analytics.call.productMentionExchange = callExchangeCount;
      }
    }
  }

  // Send to AI prospect
  if (callUseWebRTC) {
    sendWebRTCTextMessage(text);
  } else {
    fetchProspectReply(text);
  }
}

async function fetchProspectReply(userText) {
  callIsSpeaking = true;
  stopListening();

  // Show wave animation (prospect "thinking")
  const waveEl = document.getElementById('call-audio-wave');
  // Brief pause before responding (like a real person thinking)
  await new Promise(r => setTimeout(r, 200 + Math.random() * 250));

  try {
    // Call prospect chat API
    const history = callMessages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const res = await fetch('/api/prospect-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        history: history.slice(0, -1), // exclude current message (already in prompt)
        prospectId: callProspect.id,
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    const replyText = data.reply;

    // Track
    callMessages.push({ role: 'assistant', content: replyText, timestamp: Date.now() });
    if (typeof analytics !== 'undefined' && analytics.call) {
      analytics.call.prospectWordCount += replyText.split(/\s+/).length;
    }

    // Play TTS + show text
    await handleProspectMessage(replyText);

    // Check if prospect wants to end the call
    const lower = replyText.toLowerCase();
    if (lower.includes('devo andare') || lower.includes('la saluto') || lower.includes('arrivederci') || lower.includes('buona giornata')) {
      // Prospect is ending the call — wait a moment then end
      setTimeout(() => {
        if (callActive) endCall();
      }, 3000);
      return;
    }

  } catch (err) {
    console.error('Prospect reply error:', err);
    // Fallback
    await handleProspectMessage('Mi scusi, non ho capito bene. Può ripetere?');
  }

  callIsSpeaking = false;

  // Resume listening
  if (callActive && callUseSpeech && !callEnded) {
    setTimeout(startListening, 500);
  }
}

async function handleProspectMessage(text) {
  // Show wave (speaking)
  const waveEl = document.getElementById('call-audio-wave');
  if (waveEl) waveEl.classList.remove('silent');
  setWaveformState('speaking');

  // Add text to chat
  addCallMessage('prospect', text);

  // Try TTS
  try {
    const voice = PROSPECT_VOICES[callProspect.id] || 'echo';
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      callCurrentAudio = audio;

      await new Promise((resolve) => {
        audio.addEventListener('ended', resolve, { once: true });
        audio.addEventListener('error', resolve, { once: true });
        audio.play().catch(resolve);
      });

      URL.revokeObjectURL(url);
      callCurrentAudio = null;
    } else {
      // TTS failed — fall back to browser SpeechSynthesis for instant, free local voice
      await speakWithBrowserTTS(text);
    }
  } catch (e) {
    // TTS unavailable — fall back to browser SpeechSynthesis
    await speakWithBrowserTTS(text);
  }

  // Stop wave
  if (waveEl) waveEl.classList.add('silent');
  setWaveformState('silent');
}

function speakWithBrowserTTS(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      // If SpeechSynthesis not supported, just wait proportional time
      setTimeout(resolve, Math.min(3000, text.length * 40));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    
    // Find an Italian voice if available
    const voices = window.speechSynthesis.getVoices();
    const itVoice = voices.find(v => v.lang.startsWith('it'));
    if (itVoice) utterance.voice = itVoice;

    // Safety timeout in case browser events fail to fire
    const safetyTimeout = setTimeout(resolve, text.length * 80 + 1000);

    utterance.onend = () => {
      clearTimeout(safetyTimeout);
      resolve();
    };
    utterance.onerror = () => {
      clearTimeout(safetyTimeout);
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

// ══════════════════════════════════════════
// CALL MESSAGE TRACKING (no visible UI — immersive mode)
// ══════════════════════════════════════════
function addCallMessage(role, text) {
  // Track in hidden transcript for analytics/post-call
  const chat = document.getElementById('call-chat');
  if (chat) {
    const entry = document.createElement('div');
    entry.dataset.role = role;
    entry.dataset.time = new Date().toISOString();
    entry.textContent = text;
    chat.appendChild(entry);
  }

  // Analyze discovery progress when prospect speaks
  if (role === 'prospect') {
    analyzeDiscoveryProgress(text);
  }
}

function scrollCallChat() {
  // No-op — transcript is hidden in immersive mode
}

// ══════════════════════════════════════════
// WAVEFORM ANIMATION CONTROL
// ══════════════════════════════════════════
function setWaveformState(state) {
  // state: 'silent' | 'speaking' | 'user-speaking'
  const wf = document.getElementById('call-waveform');
  if (wf) {
    wf.className = 'call-waveform ' + state;
  }
}

// ══════════════════════════════════════════
// DISCOVERY PROGRESS TRACKING
// ══════════════════════════════════════════
const DISCOVERY_KEYWORDS = {
  pain: ['problema', 'difficoltà', 'casino', 'complicato', 'incubo', 'fatica', 'errori', 'sbaglio', 'lento', 'inefficiente', 'manuale', 'excel', 'foglio', 'carta', 'perdita', 'ritardo', 'confusione', 'disorganizzat'],
  budget: ['budget', 'spendere', 'investire', 'costo', 'prezzo', 'euro', 'mila', 'k', 'risorse', 'permettere', 'sostenibile'],
  decision_maker: ['moglie', 'marito', 'socio', 'titolare', 'direttore', 'responsabile', 'decidere', 'decisione', 'approvare', 'consiglio', 'amministratore', 'io decido', 'decido io', 'devo parlare con', 'sentire il'],
  timeline: ['tempistica', 'quando', 'mese', 'settimana', 'trimestre', 'anno', 'entro', 'urgente', 'subito', 'prossimo', 'prima possibile', 'q1', 'q2', 'q3', 'q4', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  current_process: ['adesso', 'attualmente', 'usiamo', 'utilizziamo', 'gestiamo', 'facciamo', 'processo', 'sistema', 'strumento', 'software', 'piattaforma', 'metodo', 'procedura', 'workflow'],
  priority: ['priorità', 'importante', 'urgente', 'critico', 'fondamentale', 'essenziale', 'prima cosa', 'obiettivo', 'focus', 'principale'],
  next_steps: ['prossimo passo', 'prossimo step', 'demo', 'rivediamoci', 'risentirci', 'mandami', 'inviar', 'appuntamento', 'calendario', 'settimana prossima', 'richiamare', 'follow up', 'follow-up']
};

function analyzeDiscoveryProgress(text) {
  const lower = text.toLowerCase();
  let changed = false;

  Object.entries(DISCOVERY_KEYWORDS).forEach(([field, keywords]) => {
    if (!discoveredFields[field]) {
      const found = keywords.some(kw => lower.includes(kw));
      if (found) {
        discoveredFields[field] = true;
        changed = true;
      }
    }
  });

  if (changed) {
    updateDiscoveryUI();
  }
}

function updateDiscoveryUI() {
  let discoveredCount = 0;
  DISCOVERY_FIELDS.forEach(field => {
    const item = document.querySelector(`.call-discovery-item[data-field="${field}"]`);
    if (item && discoveredFields[field]) {
      if (!item.classList.contains('discovered')) {
        item.classList.add('discovered');
      }
      discoveredCount++;
    }
  });

  // Update completeness bar
  const pct = Math.round((discoveredCount / DISCOVERY_FIELDS.length) * 100);
  const fill = document.getElementById('call-completeness-fill');
  const pctLabel = document.getElementById('call-completeness-pct');
  if (fill) fill.style.width = pct + '%';
  if (pctLabel) pctLabel.textContent = pct + '%';

  // Save to analytics
  if (typeof analytics !== 'undefined') {
    analytics.discoveryProgress = { ...discoveredFields, completeness: pct };
  }
}

// ══════════════════════════════════════════
// CALL CONTROLS
// ══════════════════════════════════════════
function bindCallControls() {
  const micBtn = document.getElementById('call-btn-mic');
  const muteBtn = document.getElementById('call-btn-mute');
  const endBtn = document.getElementById('call-btn-end');

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (callUseSpeech) {
        if (callIsListening) {
          stopListening();
          micBtn.classList.remove('active');
        } else {
          startListening();
          micBtn.classList.add('active');
        }
      } else {
        // Focus text input
        document.getElementById('call-input')?.focus();
      }
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      muteBtn.classList.toggle('muted');
      // Purely decorative in this simulation
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', () => {
      if (callActive) endCall();
    });
  }
}

// ══════════════════════════════════════════
// END CALL
// ══════════════════════════════════════════
function endCall() {
  if (callEnded) return;
  callEnded = true;
  callActive = false;

  // Stop recording if active
  if (callMediaRecorder && callMediaRecorder.state !== 'inactive') {
    callMediaRecorder.stop();
  } else if (callRecordingResolve) {
    callRecordingResolve(null); // resolve with null if no recording
  }

  // Stop timer
  clearInterval(callTimerInterval);

  // Stop listening
  stopListening();

  // Stop background ambient loop
  stopBgAmbient();

  // WebRTC Cleanup
  if (callLocalStream) {
    callLocalStream.getTracks().forEach(track => track.stop());
    callLocalStream = null;
  }
  if (callDataChannel) {
    callDataChannel.close();
    callDataChannel = null;
  }
  if (callPeerConnection) {
    callPeerConnection.close();
    callPeerConnection = null;
  }
  
  // ElevenLabs Cleanup
  if (typeof callSession !== 'undefined' && callSession) {
    try {
      callSession.endSession();
    } catch(e) {}
    callSession = null;
  }
  callUseWebRTC = false;

  // Stop any playing audio
  if (callCurrentAudio) {
    try {
      if (typeof callCurrentAudio.pause === 'function') callCurrentAudio.pause();
    } catch(e){}
    callCurrentAudio = null;
  }

  // Stop wave
  const waveEl = document.getElementById('call-audio-wave');
  if (waveEl) waveEl.classList.add('silent');

  // Finalize analytics
  finalizeCallAnalytics();

  // Play end call sound
  try {
    const ctx = getSndCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* ignore */ }

  // Transition to Slack DM after brief pause (Marco sends qualification task)
  setTimeout(() => {
    if (typeof window.triggerSlackPostDiscoveryCall === 'function') {
      window.triggerSlackPostDiscoveryCall(callProspect);
    }
  }, 1200);
}

// ══════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════
function initCallAnalytics(lead) {
  if (typeof analytics === 'undefined') return;

  analytics.call = {
    prospectId: lead.id,
    prospectName: lead.contact.name,
    startTime: Date.now(),
    endTime: 0,
    messages: [],
    candidateWordCount: 0,
    prospectWordCount: 0,
    talkRatio: 0,
    exchangeCount: 0,
    avgResponseTime: 0,
    productMentionExchange: -1,
    callDuration: 0,
  };
}

function finalizeCallAnalytics() {
  if (typeof analytics === 'undefined' || !analytics.call) return;

  analytics.call.endTime = Date.now();
  analytics.call.callDuration = callTimerSeconds;
  analytics.call.messages = [...callMessages];
  analytics.call.exchangeCount = callExchangeCount;

  // Format call messages and assign to analytics.callTranscript for the founder review
  if (callMessages && callMessages.length > 0) {
    analytics.callTranscript = callMessages
      .map(msg => {
        const roleName = msg.role === 'user' ? 'Candidato' : (analytics.call.prospectName || 'Prospect');
        return `${roleName}: ${msg.content}`;
      })
      .join('\n');
  }

  console.log('📊 Call Analytics:', JSON.stringify(analytics.call, null, 2));
}

// ══════════════════════════════════════════
// QUALIFICATION — CRM-INTEGRATED
// ══════════════════════════════════════════
function initQualificationCRM() {
  if (!callProspect) return;

  const lead = callProspect;

  // Set user avatar
  const userAvatar = document.getElementById('qual-user-avatar');
  if (userAvatar && typeof candidateName !== 'undefined' && candidateName) {
    userAvatar.textContent = candidateName.charAt(0).toUpperCase();
  }

  // Set timer display (show call duration as reference)
  const timerText = document.getElementById('qual-timer-text');
  if (timerText) {
    const m = Math.floor(callTimerSeconds / 60);
    const s = callTimerSeconds % 60;
    timerText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Render read-only lead list
  renderQualLeadList(lead);

  // Populate lead detail header
  renderQualLeadHeader(lead);

  // Bind form interactions
  bindQualCRMForm();
}

function renderQualLeadList(selectedLead) {
  const list = document.getElementById('qual-lead-list');
  if (!list || typeof crmLeads === 'undefined') return;

  list.innerHTML = '';
  list.classList.add('qual-lead-readonly');

  crmLeads.forEach((lead, index) => {
    const initials = lead.contact.name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase();
    const isSelected = lead.id === selectedLead.id;

    const card = document.createElement('div');
    card.className = `crm-lead-card${isSelected ? ' selected' : ''}`;
    card.style.cursor = 'default';
    card.style.animationDelay = `${index * 0.05}s`;

    card.innerHTML = `
      <div class="crm-lead-avatar"><img decoding="sync" src="avatar-${lead.id}.jpg" alt="${lead.contact.name}"></div>
      <div class="crm-lead-info">
        <span class="crm-lead-name">${lead.contact.name}</span>
        <span class="crm-lead-role">${lead.contact.role}</span>
        <span class="crm-lead-company">${lead.company}</span>
        <div class="crm-lead-meta">
          <span class="crm-lead-source">${lead.source.icon} ${lead.source.type}</span>
          <span class="crm-lead-location">${lead.location}</span>
        </div>
      </div>
      ${isSelected ? '<span class="qual-discovery-badge">✓ Discovery completata</span>' : ''}
    `;

    list.appendChild(card);
  });
}

function renderQualLeadHeader(lead) {
  const container = document.getElementById('qual-lead-header');
  if (!container) return;

  const initials = lead.contact.name.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase();

  container.innerHTML = `
    <div class="crm-detail-contact-info">
      <div class="crm-detail-avatar"><img decoding="sync" src="avatar-${lead.id}.jpg" alt="${lead.contact.name}"></div>
      <div class="crm-detail-names">
        <span class="crm-detail-contact-name">${lead.contact.name}</span>
        <span class="crm-detail-contact-role">${lead.contact.role}</span>
      </div>
    </div>
    <span class="crm-detail-company">${lead.company}</span>
    <div class="crm-detail-contact-links">
      <span class="crm-detail-link">📧 ${lead.contact.email}</span>
      <span class="crm-detail-link">📞 ${lead.contact.phone}</span>
    </div>
    <div class="crm-detail-contact-links" style="margin-top:8px">
      <span class="crm-detail-link">${lead.source.icon} ${lead.source.type}</span>
    </div>
    <div class="qual-last-activity">
      <div class="qual-last-activity-content">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2z"/></svg>
        <span>✓ Discovery Call completata</span>
      </div>
      <span class="qual-last-activity-detail">Oggi · ${new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})} · Durata ${callTimerSeconds >= 60 ? Math.floor(callTimerSeconds / 60) + ' min' : callTimerSeconds + ' sec'}</span>
    </div>
  `;
}

function bindQualCRMForm() {
  const qualState = {
    pain: false,
    budget: false,
    dm: false,
    timeline: false,
    urgency: false,
    fit: false,
    nextstep: false,
    notes: false,
  };

  // Pain textarea
  const painEl = document.getElementById('qual-pain');
  if (painEl) {
    painEl.addEventListener('input', () => {
      qualState.pain = painEl.value.trim().length > 5;
      checkQualCRMComplete(qualState);
    });
  }

  // Budget text input
  const budgetEl = document.getElementById('qual-budget');
  if (budgetEl) {
    budgetEl.addEventListener('input', () => {
      qualState.budget = budgetEl.value.trim().length > 1;
      checkQualCRMComplete(qualState);
    });
  }

  // Decision Maker text input
  const dmEl = document.getElementById('qual-dm');
  if (dmEl) {
    dmEl.addEventListener('input', () => {
      qualState.dm = dmEl.value.trim().length > 1;
      checkQualCRMComplete(qualState);
    });
  }

  // Timeline select
  const timelineEl = document.getElementById('qual-timeline');
  if (timelineEl) {
    timelineEl.addEventListener('change', () => {
      qualState.timeline = timelineEl.value !== '';
      checkQualCRMComplete(qualState);
    });
  }

  // Pill groups (urgency, fit)
  document.querySelectorAll('#phase-qualification .qual-pill-group').forEach(group => {
    group.querySelectorAll('.qual-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.qual-pill').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const field = group.dataset.field;
        qualState[field] = true;
        checkQualCRMComplete(qualState);
      });
    });
  });

  // Next Step select
  const nextstepEl = document.getElementById('qual-nextstep');
  if (nextstepEl) {
    nextstepEl.addEventListener('change', () => {
      qualState.nextstep = nextstepEl.value !== '';
      checkQualCRMComplete(qualState);
    });
  }

  // Notes textarea
  const notesEl = document.getElementById('qual-notes');
  if (notesEl) {
    notesEl.addEventListener('input', () => {
      qualState.notes = notesEl.value.trim().length > 5;
      checkQualCRMComplete(qualState);
    });
  }

  // Save button
  const saveBtn = document.getElementById('qual-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (saveBtn.disabled) return;
      saveQualificationCRM(qualState);
    });
  }
}

function checkQualCRMComplete(state) {
  const saveBtn = document.getElementById('qual-save-btn');
  if (!saveBtn) return;

  const allComplete = state.pain && state.budget && state.dm
    && state.timeline && state.urgency && state.fit
    && state.nextstep && state.notes;

  saveBtn.disabled = !allComplete;
}

function saveQualificationCRM() {
  // Gather all data
  const qualData = {
    pain: document.getElementById('qual-pain')?.value.trim() || '',
    budget: document.getElementById('qual-budget')?.value.trim() || '',
    decisionMaker: document.getElementById('qual-dm')?.value.trim() || '',
    timeline: document.getElementById('qual-timeline')?.value || '',
    urgency: document.querySelector('#qual-urgency .qual-pill.selected')?.dataset.value || '',
    fit: document.querySelector('#qual-fit .qual-pill.selected')?.dataset.value || '',
    nextStep: document.getElementById('qual-nextstep')?.value || '',
    notes: document.getElementById('qual-notes')?.value.trim() || '',
  };

  // Save to analytics
  if (typeof analytics !== 'undefined') {
    analytics.qualification = {
      ...qualData,
      prospectId: callProspect?.id || '',
      submittedAt: Date.now(),
    };
    console.log('📊 Qualification Analytics:', JSON.stringify(analytics.qualification, null, 2));
  }

  // Disable button
  const saveBtn = document.getElementById('qual-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
  }

  // Transition to Slack immediately
  if (typeof window.triggerSlackPostQualification === 'function') {
    window.triggerSlackPostQualification(callProspect);
  }
}

// ══════════════════════════════════════════
// ELEVENLABS CONVERSATIONAL AI AGENT FLOW
// ══════════════════════════════════════════
async function startElevenLabsCall(lead) {
  try {
    updateConnectionStatus('status-connecting', 'Connessione a ElevenLabs...');
    console.log("Initializing ElevenLabs Agent for:", lead.id);

    // Richiesta permessi microfono (obbligatorio per ElevenLabs SDK)
    await navigator.mediaDevices.getUserMedia({ audio: true });

    // L'SDK globale di ElevenLabs caricato localmente
    const Conversation = ElevenLabs.Conversation;

    // Mappa degli Agent ID di ElevenLabs (da sostituire con quelli reali quando li crei)
    const agentMap = {
      ferraro: "agent_1401kznc8vjzf3jbhpnx0h5d73vw",
      marchetti: "agent_9001kx1g6gkgfg2apwzhy5kp6pmb", // Attualmente questo è l'unico che hai
      greenbuild: "agent_1601kzf02k8yer58p0jqnjvn2emm", // Francesca Lombardi
      parisi: "agent_0901kzncw13eefztdkdrk6q1r2qy",
      rossi: "agent_1501kznd8f6tf3e82qvn7zqx3krx"
    };

    // Seleziona l'agente corretto, altrimenti usa quello di default
    const agentId = agentMap[lead.id] || "agent_9001kx1g6gkgfg2apwzhy5kp6pmb";

    console.log(`[ElevenLabs] Connecting to agent: ${agentId} for lead: ${lead.id}`);

    callSession = await Conversation.startSession({
      agentId: agentId,
      onConnect: () => {
        console.log("ElevenLabs: Connected!");
        updateConnectionStatus('status-realtime', 'Realtime Audio (ElevenLabs)');
        
        // Se la schermata è già visibile, o gestiamo noi il saluto o lo fa l'agente.
        // In ElevenLabs il saluto iniziale è gestito dal campo "Primo messaggio" nella dashboard.
        if (typeof triggerGreetingIfReady === 'function') {
          console.log("[ElevenLabs] Call screen visible, connection established");
        }
      },
      onDisconnect: () => {
        console.log("ElevenLabs: Disconnected");
        endCall();
      },
      onMessage: (message) => {
        console.log("ElevenLabs msg:", message);
        // Possiamo loggare il testo ricevuto
        if (message.message === "agent_response" && message.text) {
          addMessageToCall('prospect', message.text);
        }
      },
      onModeChange: (mode) => {
        console.log("ElevenLabs Mode:", mode);
        // mode può essere 'speaking' (l'IA sta parlando) o 'listening' (l'IA ci ascolta)
        const userAvatar = document.getElementById('call-user-avatar');
        const prospectAvatar = document.getElementById('call-prospect-avatar');
        
        if (mode.mode === 'speaking') {
          // L'agente parla
          userAvatar.classList.remove('speaking');
          prospectAvatar.classList.add('speaking');
          
          const waveEl = document.getElementById('call-audio-wave');
          if (waveEl) waveEl.classList.remove('silent');
          setWaveformState('speaking');
        } else {
          // L'agente ascolta (l'utente potrebbe parlare)
          prospectAvatar.classList.remove('speaking');
          userAvatar.classList.add('speaking');
          
          const waveEl = document.getElementById('call-audio-wave');
          if (waveEl) waveEl.classList.add('silent');
          setWaveformState('user-speaking');
        }
      },
      onError: (error) => {
        console.error("ElevenLabs Error:", error);
      }
    });

    // In ElevenLabs l'audio è gestito internamente dall'SDK e inviato al browser.
    
  } catch (err) {
    console.error("ElevenLabs Web SDK failed:", err);
    useLocalFallbackCall(lead, err);
  }
}

function handleOpenAIRealtimeEvent(event) {
  const waveEl = document.getElementById('call-audio-wave');
  
  // Log all non-trivial events to server for remote troubleshooting
  if (event.type === "error") {
    logToServer("ERROR", "OpenAI Realtime error", event.error);
  } else if (event.type === "session.updated") {
    logToServer("INFO", "Session configuration updated on OpenAI", {
      instructionsLength: event.session?.instructions?.length,
      voice: event.session?.audio?.output?.voice,
      turn_detection: event.session?.audio?.input?.turn_detection,
      reasoning: event.session?.reasoning
    });
  }

  switch (event.type) {
    case "error":
      console.error("[WebRTC OpenAI Error]:", event.error);
      break;
    case "session.updated":
      console.log("[WebRTC Session Updated]:", event.session);
      break;
    case "response.output_item.added":
      if (event.item && event.item.role === "assistant") {
        const itemLatency = callLastUserSpeechStoppedTime > 0 ? Date.now() - callLastUserSpeechStoppedTime : 0;
        console.log(`WebRTC: Lead started speaking (Item added: ${itemLatency}ms)`);
        logToServer("INFO", `WebRTC: Lead started speaking (Item added: ${itemLatency}ms)`);
        if (waveEl) waveEl.classList.remove('silent');
        setWaveformState('speaking');
      }
      break;

    case "input_audio_buffer.speech_started":
      console.log("VAD: User speech started");
      logToServer("INFO", "VAD: User speech started");
      if (waveEl) waveEl.classList.add('silent');
      setWaveformState('user-speaking');
      break;
      
    case "input_audio_buffer.speech_stopped":
      console.log("VAD: User speech stopped");
      logToServer("INFO", "VAD: User speech stopped");
      callLastUserSpeechStoppedTime = Date.now();
      callFirstAudioDeltaLogged = false;
      break;

    case "response.output_audio_transcript.delta":
      if (!callFirstAudioDeltaLogged && callLastUserSpeechStoppedTime > 0) {
        callFirstAudioDeltaLogged = true;
        const latency = Date.now() - callLastUserSpeechStoppedTime;
        console.log(`[LATENCY] Time to first audio transcript token: ${latency}ms (from VAD speech_stopped)`);
        logToServer("INFO", `[LATENCY] Time to first audio transcript token: ${latency}ms (from VAD speech_stopped)`);
      }
      break;
      
    case "response.audio.done":
      console.log("WebRTC: Speech output completed");
      if (waveEl) waveEl.classList.add('silent');
      setWaveformState('silent');
      break;
      
    case "conversation.item.input_audio_transcription.completed":
      const candidateText = event.transcript.trim();
      if (candidateText) {
        removeInterimPreview();
        addCallMessage('candidate', candidateText);
        callMessages.push({ role: 'user', content: candidateText, timestamp: Date.now() });
        callExchangeCount++;
        
        // Update analytics
        if (typeof analytics !== 'undefined' && analytics.call) {
          analytics.call.candidateWordCount += candidateText.split(/\s+/).length;
          analytics.call.exchangeCount = callExchangeCount;
          
          if (analytics.call.productMentionExchange === -1) {
            const lower = candidateText.toLowerCase();
            if (lower.includes('pillar') || lower.includes('software') || lower.includes('piattaforma') || lower.includes('soluzione')) {
              analytics.call.productMentionExchange = callExchangeCount;
            }
          }
        }
      }
      break;
      
    case "response.audio_transcript.done":
      const prospectText = event.transcript.trim();
      if (prospectText) {
        callProspectMessageCount++;
        addCallMessage('prospect', prospectText);
        callMessages.push({ role: 'assistant', content: prospectText, timestamp: Date.now() });
        
        if (typeof analytics !== 'undefined' && analytics.call) {
          analytics.call.prospectWordCount += prospectText.split(/\s+/).length;
        }

        // Check if prospect wants to end the call
        const lower = prospectText.toLowerCase();
        if (lower.includes('devo andare') || lower.includes('la saluto') || lower.includes('arrivederci') || lower.includes('buona giornata')) {
          setTimeout(() => {
            if (callActive) endCall();
          }, 3000);
        }
      }
      break;
      
    case "error":
      console.error("OpenAI Realtime error event:", event.error);
      break;
  }
}

function sendWebRTCTextMessage(text) {
  if (!callDataChannel || callDataChannel.readyState !== "open") return;
  
  // 1. Cancel current speaking response if any
  try {
    callDataChannel.send(JSON.stringify({ type: "response.cancel" }));
  } catch(e){}

  // 2. Create text message item
  const msgEvent = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: text
        }
      ]
    }
  };
  callDataChannel.send(JSON.stringify(msgEvent));
  
  // 3. Trigger response
  const triggerEvent = {
    type: "response.create"
  };
  callDataChannel.send(JSON.stringify(triggerEvent));
}

function useLocalFallbackCall(lead, err) {
  callUseWebRTC = false;
  const errMsg = err ? ` - ${err.message || err}` : '';
  updateConnectionStatus('status-fallback', `Motore locale (Fallback)${errMsg}`);
  // Initialize speech recognition for fallback
  initSpeechRecognition();
  
  // Local fallback greeting
  setTimeout(() => {
    const greetings = {
      ferraro: 'Pronto? Sì, mi dica.',
      marchetti: 'Pronto! Chi parla?',
      greenbuild: 'Pronto, Lombardi.',
      parisi: 'Sì pronto, buongiorno!',
      rossi: 'Pronto? Sì, sono Laura Rossi.',
    };
    const greeting = greetings[lead.id] || 'Pronto?';
    handleProspectMessage(greeting);
  }, 1500);
}

function updateConnectionStatus(statusClass, statusText) {
  const statusEl = document.getElementById('call-connection-status');
  const textEl = document.getElementById('call-connection-status-text');
  if (statusEl && textEl) {
    statusEl.className = `call-connection-status ${statusClass}`;
    textEl.textContent = statusText;
  }
}

// ══════════════════════════════════════════
// GLOBAL ENTRY POINT
// ══════════════════════════════════════════
function startDiscoveryCall(lead) {
  if (!lead) {
    console.error('No lead provided for discovery call');
    return;
  }

  // Switch to call phase
  showPhase('phase-call');

  // Show connecting screen
  setTimeout(() => {
    showConnectingScreen(lead);
  }, 200);
}

// Expose globally
window.startDiscoveryCall = startDiscoveryCall;

