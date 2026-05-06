import 'dotenv/config';
import http from 'node:http';
import { app } from './app.js';
import { attachSockets } from './socket.js';

const PORT = Number(process.env.PORT ?? 3001);

const server = http.createServer(app);
attachSockets(server);

server.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
