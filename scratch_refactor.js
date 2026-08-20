const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// Find start and end of generateEvaluationAI and generateEvaluationFallback
const startMatch = serverCode.indexOf('async function generateEvaluationAI(analytics) {');
const fallbackStart = serverCode.indexOf('function generateEvaluationFallback(analytics) {');
let endMatch = serverCode.indexOf('// ── Endpoint:', fallbackStart);
if (endMatch === -1) endMatch = serverCode.indexOf('app.post(\'/api/save-session\'', fallbackStart);

if (startMatch !== -1 && endMatch !== -1) {
    console.log('Found block to replace.');
} else {
    console.log('Block not found.');
}
