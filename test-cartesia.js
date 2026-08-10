const apiKey = "sk_car_X3rZxNgePaaRm2LuQftLqq";
const voiceId = "90b20c36-f504-4676-87c5-d71058e52e5c";

async function testModel(m) {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Cartesia-Version': '2024-06-10',
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transcript: "Prova audio",
      model_id: m,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 }
    })
  });
  console.log("Model:", m, "->", res.ok ? "SUCCESS " + (await res.arrayBuffer()).byteLength : await res.text());
}
testModel("sonic-3.5");
testModel("sonic-latest");
testModel("sonic-multilingual");
