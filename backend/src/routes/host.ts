import { Router } from 'express';

const router = Router();

// POST /api/host/speak — { text } -> audio/mpeg
router.post('/speak', async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    res.status(500).json({ error: 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not configured' });
    return;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    res.status(502).json({ error: 'elevenlabs upstream error', detail });
    return;
  }

  const audioBuffer = await response.arrayBuffer();
  res.set('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(audioBuffer));
});

export default router;
