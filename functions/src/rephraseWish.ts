import * as functions from 'firebase-functions';
import * as logger from '../../helpers/logger';

interface RephraseRequest {
  text: string;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasValidApiKey = typeof OPENAI_API_KEY === 'string' && OPENAI_API_KEY.startsWith('sk-');

if (!hasValidApiKey) {
  logger.error('Invalid or missing OPENAI_API_KEY');
}

export const rephraseWish = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { text } = (req.body || {}) as Partial<RephraseRequest>;
  if (!text) {
    res.status(400).send('Missing text');
    return;
  }

  if (!hasValidApiKey) {
    res.status(500).send('Server configuration error');
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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

    if (response.status === 401) {
      logger.error('Invalid OpenAI API key');
      res.status(500).send('Invalid OpenAI API key');
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenAI API error', response.status, errorText);
      res.status(response.status).send('OpenAI API error');
      return;
    }

    const data: OpenAIChatCompletionResponse = await response.json();
    const suggestion = data.choices?.[0]?.message?.content?.trim() || null;
    res.json({ suggestion });
  } catch (err) {
    logger.error('rephraseWish error', err);
    res.status(500).send('error');
  }
});

