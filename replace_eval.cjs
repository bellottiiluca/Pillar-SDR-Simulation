const fs = require('fs');

const generateEvaluationAIString = `
// AI scoring via GPT-4o — analyzes transcript + qualification + handoff
async function generateEvaluationAI(analytics) {
  const prospectId = analytics.call?.prospectId || 'marchetti';
  const expected = prospectExpectedDiscovery[prospectId] || prospectExpectedDiscovery.marchetti;
  
  // Costruisci il transcript con timestamp
  const callDuration = analytics.call?.callDuration || 0;
  const messages = analytics.call?.messages || [];
  let transcriptWithTs = '(nessun transcript disponibile)';
  if (messages.length > 0) {
    const startTime = messages[0].timestamp;
    transcriptWithTs = messages.map(m => {
      const isCand = m.role === 'user';
      const speaker = isCand ? (analytics.candidate?.firstName || 'Candidato') : (analytics.call?.prospectName || 'Prospect');
      const elapsed = Math.max(0, m.timestamp - startTime);
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
      return \`[\${mins}:\${secs}] [\${speaker}] \${m.content}\`;
    }).join('\\n');
  }

  const qual = analytics.qualification || {};
  const handoff = analytics.handoffMessage?.text || '(nessun handoff)';
  const crm = analytics.crm || {};
  const exchangeCount = analytics.call?.exchangeCount || 0;
  const candidateWordCount = analytics.call?.candidateWordCount || 0;
  const prospectWordCount = analytics.call?.prospectWordCount || 0;
  
  // Phase 4, 5, 6 Threads
  const formatThread = (threadArr) => {
    if (!threadArr || threadArr.length === 0) return '(non disponibile)';
    return threadArr.map(m => \`[\${m.timestamp}] [\${m.role}] \${m.sender}: \${m.text}\`).join('\\n');
  };
  const handoffThread = formatThread(analytics.handoff?.slackThread);
  const processThread = formatThread(analytics.processThread);
  const founderThread = formatThread(analytics.founderThread);

  const scoringPrompt = \`Sei Alpha Assessment Engine, un sistema di valutazione evidence-based per simulazioni professionali.
Stai valutando un candidato per il ruolo di SDR Inbound sulla base di comportamenti osservabili prodotti durante una job simulation.

Il tuo compito NON è decidere se ti piace il candidato.
Il tuo compito NON è produrre impressioni generiche.
Il tuo compito NON è premiare sicurezza, eloquenza o stile se non sono pertinenti alla specifica competenza.
Devi trasformare evidence osservabili in valutazioni strutturate, coerenti e verificabili.

PRINCIPI GENERALI:
1. EVIDENCE BEFORE JUDGMENT: Ogni valutazione deve derivare da ciò che il candidato ha effettivamente fatto, scritto o detto. Non inventare comportamenti.
2. SCORE THE COMPETENCY, NOT THE PERSON: Valuta esclusivamente la competenza indicata.
3. DO NOT DOUBLE COUNT: Lo stesso errore o successo non deve essere automaticamente premiato o penalizzato in competenze differenti.
4. CAUSAL INDEPENDENCE BETWEEN PHASES: Un problema in una fase precedente non deve trascinare automaticamente verso il basso quelle successive.
5. UNKNOWN IS NOT WRONG: Se un'informazione non è emersa nella discovery e il candidato la registra come sconosciuta, NON è un errore di documentazione.
6. DISTINGUISH FACT FROM INFERENCE: Distingui informazione emersa, inferenza ragionevole, informazione non disponibile, affermazione non supportata.
7. DO NOT REWARD VERBOSITY: Una risposta lunga non è necessariamente migliore.
8. DO NOT USE CALL LENGTH AS A SCORE PROXY.
9. SCORE CALIBRATION (0-100): 90-100 eccezionale, 80-89 forte, 70-79 buona, 60-69 parziale, 40-59 debole, 20-39 molto limitata, 0-19 non dimostrata.
10. MICRO-ASSESSMENT: Brevissima frase in italiano (max 1), specifica, spiega il motivo principale dello score, evita superlativi generici ("perfetto"). Includi forza e limite se utile.

==================================================
INPUT DELLA SIMULAZIONE
==================================================

FASE 1 — PRIORITIZZAZIONE CRM
Lead analizzati (context): Marchetti, Ferraro, GreenBuild, Parisi, Rossi (variabili per potenziale).
- Ordine di priorità deciso dal candidato: \${JSON.stringify(crm.priorityOrder || [])}
- Motivazione scritta: \${crm.priorityMotivation || '(non compilata)'}

FASE 2 — DISCOVERY CALL
Prospect Profile: \${expected.name} (\${expected.company})
Pain principale: \${expected.keyPain}
Budget: \${expected.budget}
Decision maker: \${expected.decisionMaker}
Timeline: \${expected.timeline}
Urgenza: \${expected.urgency}
Red flags: \${expected.redFlags}
Metadiche: \${callDuration}s, \${exchangeCount} scambi. \${candidateWordCount} parole candidato, \${prospectWordCount} prospect.
- Transcript con Timestamp Reali:
\${transcriptWithTs}

FASE 3 — QUALIFICAZIONE
- Pain: \${qual.pain || '(non compilato)'}
- Budget: \${qual.budget || '(non compilato)'}
- Decision Maker: \${qual.decisionMaker || '(non compilato)'}
- Timeline: \${qual.timeline || '(non compilato)'}
- Urgenza: \${qual.urgency || '(non compilato)'}
- Fit: \${qual.fit || '(non compilato)'}
- Next Step: \${qual.nextStep || '(non compilato)'}
- Note: \${qual.notes || '(non compilato)'}

FASE 4 — HANDOFF ALL'ACCOUNT EXECUTIVE
- Thread Completo con Sara Ricci (AE):
\${handoffThread !== '(non disponibile)' ? handoffThread : \`Messaggio iniziale: \${handoff}\`}

FASE 5 — MIGLIORAMENTO DEL PROCESSO
- Thread Completo con Marco Conti (Sales Manager):
\${processThread}

FASE 6 — INTERVISTA CON IL FOUNDER
- Thread Completo con Gabriel (Founder):
\${founderThread}

==================================================
RICHIESTA E FORMATO OUTPUT (STRICT JSON)
==================================================

Restituisci ESCLUSIVAMENTE un JSON valido che rispetti la seguente struttura (NON inserire blockquote, markdown o commenti):

{
  "phases": {
    "crmPrioritization": {
      "summary": "<sintesi della fase in max 2 frasi>",
      "competencies": {
        "commercialJudgment": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "buyingSignals": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "leadPrioritization": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "motivationCoherence": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    },
    "discovery": {
      "summary": "...",
      "keyMoments": [
        { "timestamp": "<MM:SS preso dal transcript>", "speaker": "<candidate|prospect>", "category": "<pain|impact|budget|decision_process|timeline|urgency|current_process|objection|buying_signal|next_step|other_relevant>", "excerpt": "<estratto fedele>", "relevance": "<perchè è rilevante>" }
      ],
      "competencies": {
        "needsExploration": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "opportunityQualification": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "objectionHandling": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "conversationControl": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    },
    "qualification": {
      "summary": "...",
      "sourceOfTruth": {
        "pain": { "status": "<explicit|reasonable_inference|not_emerged>", "value": "...", "evidence": "..." },
        "budget": { "status": "...", "value": "...", "evidence": "..." },
        "decisionMaker": { "status": "...", "value": "...", "evidence": "..." },
        "timeline": { "status": "...", "value": "...", "evidence": "..." },
        "urgency": { "status": "...", "value": "...", "evidence": "..." },
        "fit": { "status": "...", "value": "...", "evidence": "..." },
        "nextStep": { "status": "...", "value": "...", "evidence": "..." },
        "notes": { "status": "...", "value": "...", "evidence": "..." }
      },
      "crmComparison": [
        { "field": "pain", "candidateValue": "...", "callEvidence": "...", "match": "<coherent|partial|inconsistent|not_emerged>", "reason": "..." },
        { "field": "budget", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "decisionMaker", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "timeline", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "urgency", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "fit", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "nextStep", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." },
        { "field": "notes", "candidateValue": "...", "callEvidence": "...", "match": "...", "reason": "..." }
      ],
      "competencies": {
        "qualificationCompleteness": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "documentationAccuracy": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "aeOrientation": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "informationOrganization": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    },
    "handoff": {
      "summary": "...",
      "competencies": {
        "opportunityContext": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "aeRequestHandling": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "informationTransparency": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "operationalAlignment": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    },
    "processImprovement": {
      "summary": "...",
      "competencies": {
        "processAnalysis": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "improvementDesign": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    },
    "founderInterview": {
      "summary": "...",
      "competencies": {
        "professionalSelfAwareness": { "score": <0-100>, "assessment": "...", "evidence": [] },
        "coachability": { "score": <0-100>, "assessment": "...", "evidence": [] }
      }
    }
  },
  "candidateSummary": "<Executive summary dell'intera performance, 2-3 righe, 35-55 parole, pattern trasversali e forza principale. NON indicare score finale o label.>"
}
\`;

  try {
    console.log(\`🤖 [AI Scoring V2] Sending context to GPT-4o for deterministic evaluation...\`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${OPENAI_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Sei Alpha Assessment Engine V2. Rispondi SOLO con JSON valido senza markdown.' },
          { role: 'user', content: scoringPrompt }
        ],
        temperature: 0.2,
        max_tokens: 3500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(\`🤖 [AI Scoring V2] API call failed (\${response.status}):\`, errText.substring(0, 300));
      throw new Error(\`OpenAI API error: \${response.status}\`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty AI response');
    
    let cleanJson = content;
    if (cleanJson.startsWith('\`\`\`')) {
      cleanJson = cleanJson.replace(/^\`\`\`(?:json)?\\n?/, '').replace(/\\n?\`\`\`$/, '');
    }
    
    const rawAiEval = JSON.parse(cleanJson);
    
    // ── DETERMINISTIC SCORING LAYER ──
    const getScore = (phase, comp) => {
      const s = rawAiEval.phases?.[phase]?.competencies?.[comp]?.score;
      return typeof s === 'number' ? Math.max(0, Math.min(100, s)) : 0;
    };

    // Phase 1: CRM Prioritization
    const crmScoreRaw = 
      getScore('crmPrioritization', 'commercialJudgment') * 0.30 +
      getScore('crmPrioritization', 'buyingSignals') * 0.25 +
      getScore('crmPrioritization', 'leadPrioritization') * 0.25 +
      getScore('crmPrioritization', 'motivationCoherence') * 0.20;
    
    // Phase 2: Discovery Call
    const discoveryScoreRaw = 
      getScore('discovery', 'needsExploration') * 0.30 +
      getScore('discovery', 'opportunityQualification') * 0.30 +
      getScore('discovery', 'objectionHandling') * 0.20 +
      getScore('discovery', 'conversationControl') * 0.20;
      
    // Phase 3: Qualification
    const qualScoreRaw = 
      getScore('qualification', 'qualificationCompleteness') * 0.25 +
      getScore('qualification', 'documentationAccuracy') * 0.35 +
      getScore('qualification', 'aeOrientation') * 0.25 +
      getScore('qualification', 'informationOrganization') * 0.15;
      
    // Phase 4: Handoff
    const handoffScoreRaw = 
      getScore('handoff', 'opportunityContext') * 0.30 +
      getScore('handoff', 'aeRequestHandling') * 0.25 +
      getScore('handoff', 'informationTransparency') * 0.30 +
      getScore('handoff', 'operationalAlignment') * 0.15;
      
    // Phase 5: Process Improvement
    const processScoreRaw = 
      getScore('processImprovement', 'processAnalysis') * 0.50 +
      getScore('processImprovement', 'improvementDesign') * 0.50;
      
    // Phase 6: Founder Interview
    const founderScoreRaw = 
      getScore('founderInterview', 'professionalSelfAwareness') * 0.40 +
      getScore('founderInterview', 'coachability') * 0.60;
      
    // Overall Score
    const overallScoreRaw = 
      crmScoreRaw * 0.15 +
      discoveryScoreRaw * 0.30 +
      qualScoreRaw * 0.20 +
      handoffScoreRaw * 0.15 +
      processScoreRaw * 0.10 +
      founderScoreRaw * 0.10;

    // Build the final evaluation object
    const finalEval = {
      assessmentVersion: "2.0",
      candidateSummary: rawAiEval.candidateSummary || "Valutazione completata.",
      overallScore: Math.round(overallScoreRaw),
      crmScore: Math.round(crmScoreRaw),
      discoveryScore: Math.round(discoveryScoreRaw),
      qualificationScore: Math.round(qualScoreRaw),
      handoffScore: Math.round(handoffScoreRaw),
      processScore: Math.round(processScoreRaw),
      founderScore: Math.round(founderScoreRaw),
      phases: rawAiEval.phases
    };

    // Recommendation mapping
    const o = finalEval.overallScore;
    if (o >= 85) finalEval.recommendation = 'Strong Fit';
    else if (o >= 75) finalEval.recommendation = 'Good Fit';
    else if (o >= 60) finalEval.recommendation = 'Review';
    else finalEval.recommendation = 'Limited Fit';
    
    // Add legacy fields to avoid breaking old UI before refresh, or for badge logic
    const badgeMap = {
      'Strong Fit': 'badge-excellent',
      'Good Fit': 'badge-good', 
      'Review': 'badge-average',
      'Limited Fit': 'badge-poor'
    };
    finalEval.badgeClass = badgeMap[finalEval.recommendation] || 'badge-average';
    finalEval.level = finalEval.recommendation; // For legacy level if needed

    console.log(\`🤖 [AI Scoring V2] ✅ Score calculated: \${finalEval.overallScore}/100, Rec: \${finalEval.recommendation}\`);
    return finalEval;
    
  } catch (err) {
    console.error(\`🤖 [AI Scoring V2] ❌ Failed, falling back to heuristic scoring:\`, err.message);
    return generateEvaluationFallback(analytics);
  }
}
`;

let serverCode = fs.readFileSync('server.js', 'utf8');

const startMatch = serverCode.indexOf('async function generateEvaluationAI(analytics) {');
const fallbackStart = serverCode.indexOf('function generateEvaluationFallback(analytics) {');

if (startMatch !== -1 && fallbackStart !== -1) {
  const before = serverCode.substring(0, startMatch);
  const after = serverCode.substring(fallbackStart);
  
  const updatedCode = before + generateEvaluationAIString + after;
  fs.writeFileSync('server.js', updatedCode);
  console.log('Successfully replaced generateEvaluationAI in server.js');
} else {
  console.log('Could not find functions in server.js');
}
