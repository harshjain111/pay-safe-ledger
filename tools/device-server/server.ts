// ============================================================================
// Stand-alone server for api/device-push.ts — for terminals that can only be
// given a "Push Server IP" and "Push Server Port" (no domain name), which
// rules out Vercel. Runs the exact same handler as the website.
//
//   Local:   npm run device:local            (reads .env.local, port 3000)
//   Cloud:   npm run device:server:build     -> tools/device-server/dist/device-server.mjs
//            then see tools/device-server/README.md
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required
//   DEVICE_TZ_OFFSET                          optional, default +05:30
//   HOST                                      default 0.0.0.0
//   PORT                                      default 3000
//   TLS_CERT, TLS_KEY                         optional PEM paths; default
//                                             $CREDENTIALS_DIRECTORY/tls.crt|key
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { Duplex } from 'node:stream';
import { createSecureContext, TLSSocket } from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GET, POST } from '../../api/device-push';

// Local runs pick up .env.local; on the cloud server systemd provides the env.
const envFile = resolve(process.cwd(), '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
// Punches are ~500 bytes, enrolment uploads ~40 KB. Anything far bigger is not a terminal.
const MAX_BODY = 2 * 1024 * 1024;

// Lenient parsing, as the LAN listener was: tolerates bare \n line endings from older firmware.
const httpOptions = { insecureHTTPParser: true, requestTimeout: 30_000, headersTimeout: 15_000 };

const handler = async (req: IncomingMessage, res: ServerResponse) => {
  const path = (req.url ?? '/').split('?')[0].toLowerCase();
  if (path !== '/aidata.aspx' && path !== '/api/device-push' && path !== '/') {
    res.writeHead(404).end('not found');
    return;
  }
  if (req.method !== 'POST') {
    const r = GET();
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text());
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) {
      res.writeHead(413, { Connection: 'close' }).end('too large');
      req.destroy();
      return;
    }
    chunks.push(c as Buffer);
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);

  try {
    const r = await POST(
      new Request(`http://${HOST}:${PORT}${req.url}`, { method: 'POST', headers, body: Buffer.concat(chunks) }),
    );
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text());
  } catch (e) {
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'server-error', error: (e as Error).message }));
    if (!res.headersSent) res.writeHead(500).end();
  }
};

const httpServer = createServer(httpOptions, handler);

// The BioMax always speaks TLS on its push port (it has no SSL switch), so one
// port serves both: a connection whose first byte is 0x16 (TLS handshake) goes
// to the HTTPS server with a self-signed cert, anything else to plain HTTP.
const credDir = process.env.CREDENTIALS_DIRECTORY ?? '';
const certFile = process.env.TLS_CERT || (credDir && join(credDir, 'tls.crt'));
const keyFile = process.env.TLS_KEY || (credDir && join(credDir, 'tls.key'));
const secureContext =
  certFile && keyFile && existsSync(certFile) && existsSync(keyFile)
    ? createSecureContext({ cert: readFileSync(certFile), key: readFileSync(keyFile), minVersion: 'TLSv1' })
    : null;

const front = createNetServer((socket) => {
  socket.on('error', () => {});
  socket.setTimeout(30_000, () => socket.destroy());
  socket.once('data', (first) => {
    if (first[0] !== 0x16 || !secureContext) {
      socket.pause();
      socket.unshift(first);
      httpServer.emit('connection', socket);
      socket.resume();
      return;
    }
    // TLS reads the raw socket natively and would miss the byte already read,
    // so decrypt through a stream that replays it.
    const pipe = new Duplex({
      read() {},
      write(chunk, _enc, cb) { socket.write(chunk, cb); },
      final(cb) { socket.end(); cb(); },
      destroy(err, cb) { socket.destroy(); cb(err); },
    });
    pipe.push(first);
    socket.on('data', (c) => pipe.push(c));
    socket.on('end', () => pipe.push(null));
    socket.on('close', () => pipe.destroy());
    const tlsSocket = new TLSSocket(pipe as never, { isServer: true, secureContext });
    tlsSocket.on('error', (e) =>
      console.log(JSON.stringify({ at: new Date().toISOString(), event: 'tls-error', from: socket.remoteAddress, error: e.message })),
    );
    tlsSocket.once('secure', () => httpServer.emit('connection', tlsSocket));
  });
});

front.listen(PORT, HOST, () =>
  console.log(`device-push listening on ${HOST}:${PORT}/AIData.aspx (http${secureContext ? ' + https' : ' only'})`),
);
