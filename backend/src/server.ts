import 'dotenv/config';
import http from 'node:http';
import { app } from './app.js';
import { attachSockets } from './socket.js';
import { initSettings } from './lib/settings.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const server = http.createServer(app);
attachSockets(server);

async function start() {
  await initSettings();
  server.listen(PORT, HOST, () => {
    console.log(`[backend] listening on http://${HOST}:${PORT}`);
  });
}

void start();
