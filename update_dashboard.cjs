const fs = require('fs');

let code = fs.readFileSync('dashboard.js', 'utf8');

// --- 1. Header Fix ---
code = code.replace(
  /const aiEval = \{\};[\s\S]*?\$\{escapeHtml\(ev\.recExplain \|\| ''\)\}/g,
  (match) => {
    return match.replace(
      /\$\{escapeHtml\(ev\.recExplain \|\| ''\)\}/,
      "${escapeHtml(ev.candidateSummary || ev.recExplain || '')}"
    );
  }
);
// In case the first replace missed because of slightly different regex
code = code.replace(
  /<div class="rpt-hdr-ai-text">\$\{escapeHtml\(ev\.recExplain \|\| ''\)\}<\/div>/g,
  '<div class="rpt-hdr-ai-text">${escapeHtml(ev.candidateSummary || ev.recExplain || \'\')}</div>'
);

// --- 2. Phase 1 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const comps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let comps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.crmPrioritization) {
                const cmp = ev.phases.crmPrioritization.competencies;
                const nameMap = { commercialJudgment: 'Giudizio commerciale', buyingSignals: 'Riconoscimento dei segnali d\\'acquisto', leadPrioritization: 'Prioritizzazione dei lead', motivationCoherence: 'Coerenza della motivazione' };
                const defMap = { commercialJudgment: 'Valuta la capacità di identificare il lead con il maggior potenziale commerciale, considerando valore, urgenza, probabilità di conversione e contesto.', buyingSignals: 'Valuta la capacità di identificare e interpretare i principali segnali d\\'acquisto, come pain, urgenza, interesse, budget e processo decisionale.', leadPrioritization: 'Valuta la capacità di ordinare i lead secondo una logica commerciale coerente, assegnando la giusta priorità a ciascuna opportunità.', motivationCoherence: 'Valuta quanto la motivazione fornita è coerente con le informazioni disponibili e supporta in modo logico le decisioni prese.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  comps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                comps = [
                  { name: 'Giudizio commerciale', def: 'Valuta la capacità di identificare il lead con il maggior potenziale commerciale, considerando valore, urgenza, probabilità di conversione e contesto.', status: crmScore >= 85 ? 'excellent' : crmScore >= 70 ? 'solid' : crmScore >= 50 ? 'adequate' : 'needs-work', desc: fb.p1_giudizio_commerciale || (crmScore >= 85 ? 'Hai identificato correttamente il lead con il maggior potenziale commerciale.' : crmScore >= 70 ? 'Hai individuato un lead ad alto potenziale, anche se non la prima scelta assoluta.' : crmScore >= 50 ? 'La scelta del lead riflette solo parzialmente il reale potenziale commerciale.' : 'Non hai identificato il lead prioritario o i criteri usati non sono abbastanza solidi.') },
                  { name: 'Riconoscimento dei segnali d\\'acquisto', def: 'Valuta la capacità di identificare e interpretare i principali segnali d\\'acquisto, come pain, urgenza, interesse, budget e processo decisionale.', status: crmScore >= 80 ? 'solid' : crmScore >= 60 ? 'adequate' : 'needs-work', desc: fb.p1_riconoscimento_segnali || (crmScore >= 80 ? 'Hai interpretato correttamente pain, urgenza e livello di interesse.' : crmScore >= 60 ? 'Hai colto alcuni segnali d\\'acquisto, ma ne hai tralasciati altri importanti.' : 'Forte difficoltà nell\\'interpretare i segnali chiave d\\'acquisto e di urgenza.') },
                  { name: 'Prioritizzazione dei lead', def: 'Valuta la capacità di ordinare i lead secondo una logica commerciale coerente, assegnando la giusta priorità a ciascuna opportunità.', status: crmScore >= 85 ? 'excellent' : crmScore >= 70 ? 'solid' : crmScore >= 50 ? 'adequate' : 'needs-work', desc: fb.p1_prioritizzazione_lead || (crmScore >= 85 ? 'L\\'ordine dei lead riflette una logica commerciale perfetta e coerente.' : crmScore >= 70 ? 'La prioritizzazione ha senso logico nella maggior parte delle assegnazioni.' : crmScore >= 50 ? 'Ci sono discrepanze nell\\'ordine commerciale assegnato ai lead minori.' : 'L\\'ordine assegnato sembra casuale o basato su metriche errate.') },
                  { name: 'Coerenza della motivazione', def: 'Valuta quanto la motivazione fornita è coerente con le informazioni disponibili e supporta in modo logico le decisioni prese.', status: crmScore >= 80 ? 'solid' : crmScore >= 60 ? 'adequate' : 'needs-work', desc: fb.p1_coerenza_motivazione || (crmScore >= 80 ? 'La motivazione è ben strutturata e supporta la decisione presa.' : crmScore >= 60 ? 'La motivazione è presente ma manca di profondità commerciale.' : 'La motivazione è insufficiente, incoerente o del tutto assente.') }
                ];
              }`
);

// --- 3. Phase 2 Key Moments ---
// Replacing the logic generating 'moments' array
code = code.replace(
  /const msgList = messages && messages\.length > 0 \? messages : \(transcript && transcript\.length > 0 \? transcript : \[\]\);[\s\S]*?return moments\.map\(km => `/m,
  `if (ev.assessmentVersion >= '2.0' && ev.phases?.discovery?.keyMoments?.length > 0) {
                  return ev.phases.discovery.keyMoments.map(km => \`
                <div class="rpt-key-moment" onclick="showToast('Riproduzione da \${km.timestamp}...')">
                    <span class="rpt-ts-pill" style="margin-left: 0; pointer-events: none;"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>\${km.timestamp}</span>
                  <span class="rpt-km-text"><strong>[\${escapeHtml(km.speaker)}]:</strong> \${escapeHtml(km.excerpt)} <br><span style="color:var(--db-text-muted);font-size:12px;opacity:0.8;">\${escapeHtml(km.relevance)}</span></span>
                </div>
              \`).join('');
                }
                
                const msgList = messages && messages.length > 0 ? messages : (transcript && transcript.length > 0 ? transcript : []);
                if (!msgList || msgList.length === 0) return '<div class="rpt-key-moment"><span class="rpt-km-text">Nessun momento chiave disponibile.</span></div>';
                
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
                
                return moments.map(km => \``
);

// --- 4. Phase 2 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const callComps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let callComps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.discovery) {
                const cmp = ev.phases.discovery.competencies;
                const nameMap = { needsExploration: 'Esplorazione dei bisogni', opportunityQualification: 'Qualificazione dell’opportunità', objectionHandling: 'Gestione delle obiezioni', conversationControl: 'Controllo della conversazione' };
                const defMap = { needsExploration: 'Valuta la capacità di esplorare il contesto del prospect, identificando bisogni, pain point e informazioni rilevanti attraverso domande efficaci.', opportunityQualification: 'Valuta la capacità di raccogliere le informazioni necessarie per comprendere il potenziale dell’opportunità commerciale, considerando priorità, processo decisionale, tempistiche e contesto.', objectionHandling: 'Valuta la capacità di riconoscere, approfondire e gestire le obiezioni del prospect, mantenendo il focus sugli obiettivi della conversazione.', conversationControl: 'Valuta la capacità di guidare la conversazione mantenendo struttura, direzione e focus, accompagnando il prospect verso il prossimo passo.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  callComps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                callComps = [
                  { name: 'Esplorazione dei bisogni', def: 'Valuta la capacità di esplorare il contesto del prospect, identificando bisogni, pain point e informazioni rilevanti attraverso domande efficaci.', status: callScore >= 80 ? 'excellent' : callScore >= 60 ? 'solid' : 'adequate', score: callScore >= 80 ? 92 : 75, desc: fb.p2_esplorazione_bisogni || 'Hai lasciato spazio al prospect dimostrando un ottimo listen ratio.' },
                  { name: 'Qualificazione dell’opportunità', def: 'Valuta la capacità di raccogliere le informazioni necessarie per comprendere il potenziale dell’opportunità commerciale, considerando priorità, processo decisionale, tempistiche e contesto.', status: callScore >= 85 ? 'excellent' : callScore >= 65 ? 'solid' : 'adequate', score: callScore >= 85 ? 88 : 70, desc: fb.p2_qualificazione_tecnica || 'Hai identificato con chiarezza pain e timeline, leggermente meno il budget.' },
                  { name: 'Gestione delle obiezioni', def: 'Valuta la capacità di riconoscere, approfondire e gestire le obiezioni del prospect, mantenendo il focus sugli obiettivi della conversazione.', status: callScore >= 80 ? 'solid' : callScore >= 50 ? 'adequate' : 'needs-work', score: callScore >= 80 ? 85 : 60, desc: fb.p2_riconoscimento_budget || "Hai gestito l'obiezione sul prezzo proponendo subito una demo di valore." },
                  { name: 'Controllo della conversazione', def: 'Valuta la capacità di guidare la conversazione mantenendo struttura, direzione e focus, accompagnando il prospect verso il prossimo passo.', status: callScore >= 90 ? 'excellent' : callScore >= 70 ? 'solid' : 'adequate', score: callScore >= 90 ? 95 : 80, desc: fb.p2_gestione_flusso || 'Il tono di voce era sempre rassicurante e la parlata fluida.' }
                ];
              }`
);

// --- 5. Phase 3 Accuracy Table ---
code = code.replace(
  /const accuracyHtml = `[\s\S]*?`;/,
  `let accuracyHtml = '';
  if (ev.assessmentVersion >= '2.0' && ev.phases?.qualification?.crmComparison) {
    accuracyHtml = \`
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
        \${ev.phases.qualification.crmComparison.map(acc => {
          const fieldMap = { pain: 'Pain', budget: 'Budget', decisionMaker: 'Decision Maker', timeline: 'Timeline', urgency: 'Urgenza', fit: 'Fit', nextStep: 'Next Step', notes: 'Note' };
          const fLabel = fieldMap[acc.field] || acc.field;
          const statusMap = { coherent: 'Coerente', partial: 'Parziale', inconsistent: 'Incoerente', not_emerged: 'Non emerso' };
          const statusText = statusMap[acc.match] || acc.match;
          const statusClass = (statusText || '').toLowerCase().replace(/ /g, '-');
          
          let aiTextHtml = escapeHtml(acc.callEvidence);
          if (acc.reason) aiTextHtml += \`<br><span style="color:var(--db-text-muted);font-size:12px;opacity:0.8;">\${escapeHtml(acc.reason)}</span>\`;
          
          const candText = acc.candidateValue && acc.candidateValue !== '(non compilato)' ? escapeHtml(acc.candidateValue) : '<span class="empty-val">Non compilato</span>';

          return \`
            <tr>
              <td>\${escapeHtml(fLabel)}</td>
              <td style="width: 40%;" class="cand-text">\${candText}</td>
              <td style="width: 35%;" class="ai-text">\${aiTextHtml}</td>
              <td style="width: 15%;"><span class="rpt-accuracy-status \${statusClass}">\${escapeHtml(statusText)}</span></td>
            </tr>
          \`;
        }).join('')}
      </tbody>
    </table>
    \`;
  } else {
    accuracyHtml = \`
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
        \${crmFields.map(f => {
          if (!f.value && f.label === 'Note') return '';
          const acc = accuracyData.find(a => a.field.toLowerCase() === f.label.toLowerCase()) || {};
          const status = acc.status || (f.value && f.value !== 'Nessuna nota aggiuntiva.' ? 'Coerente' : 'N/A');
          const statusClass = status.toLowerCase().replace(/ /g, '-');
          const tsHtml = acc.callTimestamp ? \` <button class="rpt-ts-pill" onclick="event.stopPropagation(); showToast('Riproduzione audio da \${acc.callTimestamp}')"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>\${escapeHtml(acc.callTimestamp)}</button>\` : '';
          const aiText = acc.fromCall ? escapeHtml(acc.fromCall) : 'Nessun appunto rilevante perso.';
          const candText = f.value && f.value !== 'Nessuna nota aggiuntiva.' ? escapeHtml(f.value) : '<span class="empty-val">Non compilato</span>';
          return \`
            <tr>
              <td>\${escapeHtml(f.label)}</td>
              <td style="width: 40%;" class="cand-text">\${candText}</td>
              <td style="width: 35%;" class="ai-text">\${aiText}\${tsHtml}</td>
              <td style="width: 15%;"><span class="rpt-accuracy-status \${statusClass}">\${escapeHtml(status)}</span></td>
            </tr>
          \`;
        }).join('')}
      </tbody>
    </table>
    \`;
  }`
);

// --- 6. Phase 3 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const qualComps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let qualComps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.qualification) {
                const cmp = ev.phases.qualification.competencies;
                const nameMap = { qualificationCompleteness: 'Completezza della qualificazione', documentationAccuracy: 'Accuratezza della documentazione', aeOrientation: 'Orientamento all\\'Account Executive', informationOrganization: 'Organizzazione delle informazioni' };
                const defMap = { qualificationCompleteness: 'Valuta quanto il candidato ha registrato tutte le informazioni utili che erano effettivamente disponibili dopo la discovery.', documentationAccuracy: 'Valuta fedeltà, precisione e assenza di informazioni inventate o distorte.', aeOrientation: 'Valuta se il CRM consente all\\'Account Executive di capire rapidamente opportunità, contesto, unknown rilevanti e next step.', informationOrganization: 'Valuta chiarezza, struttura, leggibilità e corretta collocazione delle informazioni.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  qualComps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                qualComps = [
                  { name: 'Completezza della qualificazione', def: 'Valuta quanto le informazioni raccolte coprono i criteri essenziali per qualificare un lead (BANT o framework simili).', status: qualScore >= 80 ? 'excellent' : qualScore >= 60 ? 'solid' : 'adequate', score: qualScore >= 80 ? 90 : 70, desc: fb.p3_completezza_dati || 'Hai compilato quasi tutti i campi necessari per procedere.' },
                  { name: 'Accuratezza della documentazione', def: 'Valuta la fedeltà e la precisione con cui le informazioni emerse in call sono state riportate nel CRM, senza alterazioni o omissioni.', status: qualScore >= 85 ? 'excellent' : qualScore >= 70 ? 'solid' : 'needs-work', score: qualScore >= 85 ? 95 : 65, desc: fb.p3_accuratezza_dati || 'Le note riflettono fedelmente quanto emerso nella chiamata.' },
                  { name: 'Orientamento all’Account Executive', def: 'Valuta la capacità di strutturare le note in modo chiaro, utile e azionabile per chi dovrà prendere in carico il lead.', status: qualScore >= 75 ? 'solid' : qualScore >= 50 ? 'adequate' : 'needs-work', score: qualScore >= 75 ? 80 : 55, desc: fb.p3_utilita_ae || 'Le informazioni sono sufficienti per un AE, ma mancano i dettagli organizzativi.' }
                ];
              }`
);

// --- 7. Phase 4 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const handoffComps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let handoffComps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.handoff) {
                const cmp = ev.phases.handoff.competencies;
                const nameMap = { opportunityContext: 'Contestualizzazione dell\\'opportunità', aeRequestHandling: 'Gestione delle richieste dell\\'AE', informationTransparency: 'Trasparenza informativa', operationalAlignment: 'Allineamento operativo' };
                const defMap = { opportunityContext: 'Capacità di trasferire rapidamente prospect, problema, impatto e informazioni essenziali.', aeRequestHandling: 'Capacità di comprendere le richieste successive dell\\'AE e rispondere in modo pertinente.', informationTransparency: 'Capacità di distinguere ciò che è noto, ciò che è inferito e ciò che manca.', operationalAlignment: 'Capacità di allinearsi su priorità, informazioni mancanti e azioni necessarie.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  handoffComps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                handoffComps = [
                  { name: 'Contestualizzazione dell\\'opportunità', def: 'Valuta la capacità di sintetizzare il prospect, il problema principale e il motivo per cui l\\'AE dovrebbe prendere in carico il deal.', status: handoffScore >= 80 ? 'excellent' : handoffScore >= 60 ? 'solid' : 'adequate', score: handoffScore >= 80 ? 88 : 65, desc: fb.p4_contesto || 'Hai fornito il contesto base in modo chiaro.' },
                  { name: 'Gestione delle richieste dell\\'AE', def: 'Valuta la reattività e la precisione nel rispondere alle domande di approfondimento dell\\'Account Executive in modo proattivo.', status: handoffScore >= 85 ? 'excellent' : handoffScore >= 65 ? 'solid' : 'needs-work', score: handoffScore >= 85 ? 90 : 60, desc: fb.p4_gestione_richieste || 'Hai risposto puntualmente a Sara senza perdere tempo.' },
                  { name: 'Allineamento operativo', def: 'Valuta la capacità di concordare chiaramente i prossimi passi e chi farà cosa per portare avanti il deal.', status: handoffScore >= 75 ? 'solid' : 'adequate', score: handoffScore >= 75 ? 82 : 68, desc: fb.p4_allineamento || 'I next steps sono stati confermati correttamente.' }
                ];
              }`
);

// --- 8. Phase 5 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const processComps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let processComps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.processImprovement) {
                const cmp = ev.phases.processImprovement.competencies;
                const nameMap = { processAnalysis: 'Analisi del processo', improvementDesign: 'Progettazione dei miglioramenti' };
                const defMap = { processAnalysis: 'Capacità di individuare inefficienze e opportunità di miglioramento basandosi sull\\'esperienza concreta.', improvementDesign: 'Capacità di trasformare problemi identificati in interventi concreti e applicabili.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  processComps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                processComps = [
                  { name: 'Analisi del processo', def: 'Valuta la capacità di individuare inefficienze o colli di bottiglia nel flusso di lavoro appena svolto, basandosi su dati concreti.', status: processScore >= 80 ? 'excellent' : processScore >= 60 ? 'solid' : 'adequate', score: processScore >= 80 ? 85 : 70, desc: fb.p5_analisi || 'Hai individuato i punti deboli principali del processo di qualifica.' },
                  { name: 'Progettazione dei miglioramenti', def: 'Valuta la qualità e l\\'applicabilità delle soluzioni proposte per risolvere i problemi identificati e aumentare l\\'efficienza.', status: processScore >= 85 ? 'excellent' : processScore >= 65 ? 'solid' : 'needs-work', score: processScore >= 85 ? 90 : 65, desc: fb.p5_progettazione || 'Le soluzioni proposte sono sensate ma mancano di specificità tecnologica.' }
                ];
              }`
);

// --- 9. Phase 6 Comps ---
code = code.replace(
  /const fb = ev\.competencyFeedback \|\| \{\};\s*const founderComps = \[[\s\S]*?\];\s*const scoresMap = \{ excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 \};/m,
  `const fb = ev.competencyFeedback || {};
              let founderComps = [];
              const scoresMap = { excellent: 94, solid: 82, adequate: 65, 'needs-work': 45 };
              if (ev.assessmentVersion >= '2.0' && ev.phases?.founderInterview) {
                const cmp = ev.phases.founderInterview.competencies;
                const nameMap = { professionalSelfAwareness: 'Consapevolezza professionale', coachability: 'Coachability' };
                const defMap = { professionalSelfAwareness: 'Capacità di analizzare realisticamente la propria performance, riconoscendo decisioni, limiti ed errori.', coachability: 'Capacità dimostrata di comprendere il feedback, riconsiderare scelte e spiegare comportamenti futuri.' };
                for (const [k, v] of Object.entries(nameMap)) {
                  const s = cmp[k]?.score || 0;
                  const stat = s >= 85 ? 'excellent' : s >= 70 ? 'solid' : s >= 50 ? 'adequate' : 'needs-work';
                  founderComps.push({ name: v, def: defMap[k], status: stat, score: s, desc: cmp[k]?.assessment || 'N/A' });
                }
              } else {
                founderComps = [
                  { name: 'Consapevolezza professionale', def: 'Valuta la capacità di autovalutare la propria performance in modo obiettivo, riconoscendo pregi e aree di miglioramento.', status: founderScore >= 80 ? 'excellent' : founderScore >= 60 ? 'solid' : 'adequate', score: founderScore >= 80 ? 88 : 72, desc: fb.p6_consapevolezza || 'Ti sei dimostrato onesto nell\\'analizzare le tue performance.' },
                  { name: 'Coachability', def: 'Valuta la capacità di ricevere feedback dal management e tradurlo immediatamente in un piano d\\'azione concreto e positivo.', status: founderScore >= 85 ? 'excellent' : founderScore >= 65 ? 'solid' : 'needs-work', score: founderScore >= 85 ? 92 : 65, desc: fb.p6_coachability || 'Hai accolto bene i suggerimenti, dimostrando apertura al cambiamento.' }
                ];
              }`
);

fs.writeFileSync('dashboard.js', code);
console.log('Update completed successfully.');
