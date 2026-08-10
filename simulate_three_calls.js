async function runSimulation() {
  const url = 'http://localhost:3001/api/discovery-call';

  async function executeCall(prospectId, turns, scenarioName) {
    console.log(`\n==================================================`);
    console.log(`🎬 SCENARIO: ${scenarioName}`);
    console.log(`==================================================`);
    const history = [];

    for (const msg of turns) {
      console.log(`SDR: "${msg}"`);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId, message: msg, history })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`Lead: "${data.reply}"\n`);
        history.push({ role: 'user', content: msg });
        history.push({ role: 'assistant', content: data.reply });
      } catch (e) {
        console.error("Error:", e.message);
      }
    }
  }

  // 1. Marco Ferraro - Weak SDR (Early pitch, no pain found, hard rejection)
  const ferraroTurns = [
    "Pronto, buongiorno! Sono Luca di Pillar. La disturbo?",
    "Volevo farle qualche domanda generica su come gestite i cantieri organizzativamente, avete problemi?",
    "Capisco. Allora facciamo una demo di mezz'ora settimana prossima per farle vedere come funziona?",
    "Ma guardi che risparmierebbe un sacco di tempo a coordinarsi, è sicuro di non voler dare un'occhiata?"
  ];

  // 2. Francesca Lombardi - Skilled SDR (Finds pain, handles objection, books demo)
  const lombardiTurns = [
    "Pronto, Dott.ssa Lombardi? Sono Luca di Pillar. La disturbo?",
    "La chiamo per il whitepaper che ha scaricato. Siete su Excel al momento per i cantieri?",
    "E come gestite le varianti extra-capitolato per assicurarvi che l'ufficio acquisti le riceva e le fatturi in tempo?",
    "Questo vi fa perdere marginalità a fine anno sulle commesse?",
    "Capisco, è un problema comune. Le andrebbe di fare una demo di mezz'ora settimana prossima per vedere come bloccare queste perdite?",
    "Capisco perfettamente. Facciamo così: ci prendiamo solo 10 minuti martedì, le mostro solo come si traccia una variante extra in 30 secondi in modo da preparare la sintesi per il suo CTO senza sforzo. Che ne dice?"
  ];

  // 3. Davide Parisi - Generic SDR (Likes tech but has no urgency, early pitch gets rejected)
  const parisiTurns = [
    "Pronto Davide, ciao! Sono Luca di Pillar.",
    "Hai letto il nostro blog. Volevo capire come gestite i verbali di cantiere oggi.",
    "Bello! Le andrebbe di fare una demo del nostro software Pillar settimana prossima per migliorare?",
    "Dai, dura solo 15 minuti, ti mostro il software che ti piacerà sicuramente!"
  ];

  await executeCall('ferraro', ferraroTurns, '1. Marco Ferraro (SDR Debole - Discovery Fallita)');
  await executeCall('greenbuild', lombardiTurns, '2. Francesca Lombardi (SDR Esperto - Discovery di Successo)');
  await executeCall('parisi', parisiTurns, '3. Davide Parisi (SDR Affrettato - Rifiuto per Mancanza di Urgenza)');
}

runSimulation();
