const functions = require('firebase-functions');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

exports.rephraseWish = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  const { text } = req.body;
  if (!text) {
    res.status(400).send('Missing text');
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'You are a wish clarity assistant.' },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
      }),
    });
    const data = await response.json();
    const suggestion = data.choices?.[0]?.message?.content?.trim();
    res.json({ suggestion });
  } catch (err) {
    console.error('rephraseWish error', err);
    res.status(500).send('error');
  }
});
