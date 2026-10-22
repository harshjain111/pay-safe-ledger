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
// ============================================================================

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const server = createServer(
  // Lenient parsing, as the LAN listener was: tolerates bare \n line endings from older firmware.
  { insecureHTTPParser: true, requestTimeout: 30_000, headersTimeout: 15_000 },
  async (req, res) => {
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
  },
);

server.listen(PORT, HOST, () => console.log(`device-push listening on http://${HOST}:${PORT}/AIData.aspx`));
