import express from 'express';
import cors from 'cors';
import cluesRouter from './routes/clues.js';
import playersRouter from './routes/players.js';
import scoresRouter from './routes/scores.js';
import seasonsRouter from './routes/seasons.js';
import hostRouter from './routes/host.js';
import judgeRouter from './routes/judge.js';
import roomsRouter from './routes/rooms.js';
import settingsRouter from './routes/settings.js';
import { corsOrigin } from './lib/cors.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: corsOrigin() }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/clues', cluesRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/scores', scoresRouter);
  app.use('/api/seasons', seasonsRouter);
  app.use('/api/host', hostRouter);
  app.use('/api/judge', judgeRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/settings', settingsRouter);

  return app;
}

export const app = createApp();
