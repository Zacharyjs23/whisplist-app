import * as functions from 'firebase-functions/v2/https';
import fetch from 'node-fetch';

interface RephraseRequest {
  text: string;
  tone?: 'gentle' | 'concise' | 'uplifting';
}

export const rephraseWish = functions.onRequest(async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { text, tone = 'gentle' } = body as RephraseRequest;
    if (
      !text ||
      typeof text !== 'string' ||
      text.length > 1000 ||
      !['gentle', 'concise', 'uplifting'].includes(tone)
    ) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    const openAiPayload = {
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'user',
          content: `Rephrase empathetically (${tone}). Keep meaning, <=200 chars:\n${text}`,
        },
      ],
    };

    let attempt = 0;
    let response: any;
    while (attempt < 3) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openAiPayload),
      });
      if (response.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt++)));
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: data?.error?.message || 'openai_failed' });
    }

    const out = data?.choices?.[0]?.message?.content?.trim() || '';
    return res.json({ text: out });
  } catch {
    return res.status(500).json({ error: 'internal' });
  }
});
