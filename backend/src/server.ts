import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cluesRouter from './routes/clues.js';
import playersRouter from './routes/players.js';
import scoresRouter from './routes/scores.js';
import seasonsRouter from './routes/seasons.js';
import hostRouter from './routes/host.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/clues', cluesRouter);
app.use('/api/players', playersRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/host', hostRouter);

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
