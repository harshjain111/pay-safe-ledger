#!/usr/bin/env node
// ===========================================================================
// Push-data listener for the BioMax / fk_device terminal (R6, "AIData.aspx").
//
// The device POSTs JSON to this PC over the LAN. For each request:
//   - it is logged (raw bytes) to tools/device-listener/captures/ (git-ignored;
//     enrolment pushes contain biometric data, so delete those files once the
//     format is settled);
//   - it is acknowledged so the device sees a reply;
//   - realtime_glog (attendance) punches with a userId are forwarded to
//     ingest-punches, stamped with the time the PC received them.
//
// Environment (set in the shell before running):
//   INGEST_URL         https://<project-id>.supabase.co/functions/v1/ingest-punches
//   SUPABASE_ANON_KEY  the project's anon (publishable) key
//   DEVICE_KEY         the device's API key, shown once in Settings > Hardware
//
// Usage:
//   node listener.cjs                 <- listens on 0.0.0.0:9001
//   node listener.cjs 9001            <- explicit port
// ===========================================================================

const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 9001);
const INGEST_URL = process.env.INGEST_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DEVICE_KEY = process.env.DEVICE_KEY || '';
const FORWARD = Boolean(INGEST_URL && ANON_KEY && DEVICE_KEY);

// The device re-sends a punch until it gets a reply it accepts. Identical
// punches (same user, same direction) inside this window are dropped.
const DUPLICATE_WINDOW_MS = 60_000;
const recentPunches = new Map(); // "userId|IN" -> last forwarded epoch ms

const OUT_DIR = path.join(__dirname, 'captures');
fs.mkdirSync(OUT_DIR, { recursive: true });

const stamp = () => new Date().toISOString();
const logFile = path.join(OUT_DIR, `push-${new Date().toISOString().slice(0, 10)}.log`);

function record(line) {
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function hexAscii(buf) {
  const ascii = [...buf].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  return `${buf.toString('hex')}\n  ascii: ${ascii}`;
}

function reply(socket, status, body) {
  const payload = Buffer.from(body);
  socket.write(
    `HTTP/1.1 ${status}\r\nContent-Type: application/json\r\n` +
      `Content-Length: ${payload.length}\r\nConnection: close\r\n\r\n`
  );
  socket.end(payload);
}

async function forwardPunch(p) {
  const punchKey = `${p.userId}|${p.inOut}`;
  const now = Date.now();
  const last = recentPunches.get(punchKey);
  if (last && now - last < DUPLICATE_WINDOW_MS) {
    record(`[${stamp()}] skip repeat ${punchKey} (${now - last} ms after the last one)`);
    return;
  }
  recentPunches.set(punchKey, now);

  if (!FORWARD) {
    record(`[${stamp()}] not forwarded (set INGEST_URL, SUPABASE_ANON_KEY, DEVICE_KEY): ${punchKey}`);
    return;
  }

  const body = {
    events: [
      {
        employee_id: p.userId,
        direction: p.inOut === 'IN' ? 'in' : 'out',
        ts: new Date(now).toISOString(), // server receive time; device clock is not used
        method: p.verifyMode === 'Face' ? 'face' : 'biometric',
        raw_ref: `${p.time}|${p.userId}|${new Date(now).toISOString()}`,
      },
    ],
  };

  try {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON_KEY,
        'x-device-key': DEVICE_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    record(`[${stamp()}] forwarded ${punchKey} -> HTTP ${res.status} ${text}`);
  } catch (err) {
    recentPunches.delete(punchKey); // allow a retry on the next push
    record(`[${stamp()}] forward failed for ${punchKey}: ${err.message}`);
  }
}

const server = net.createServer((socket) => {
  const who = `${socket.remoteAddress}:${socket.remotePort}`;
  let buf = Buffer.alloc(0);
  let answered = false;
  record(`[${stamp()}] connect ${who}`);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (answered) return;
    const headEnd = buf.indexOf('\r\n\r\n');
    if (headEnd === -1) return; // headers not complete yet

    const head = buf.slice(0, headEnd).toString('latin1');
    const m = /content-length:\s*(\d+)/i.exec(head);
    const need = headEnd + 4 + (m ? Number(m[1]) : 0);
    if (buf.length < need) return; // body still arriving

    answered = true;
    const raw = buf.slice(0, need);
    const body = buf.slice(headEnd + 4, need).toString('latin1');
    const code = /request_code:\s*(\S+)/i.exec(head);
    const requestCode = code ? code[1] : '(none)';
    record(`[${stamp()}] request ${requestCode} from ${who} (${raw.length} bytes)`);

    // Acknowledge first, so the device has its reply before we forward anything.
    // The device expects the reply to name the request it answers; a bare
    // {"result":true} leaves it re-sending the same record.
    reply(socket, '200 OK', JSON.stringify({ ret: requestCode, result: true, count: 1 }));

    if (requestCode !== 'realtime_glog') return;
    let p;
    try {
      p = JSON.parse(body);
    } catch {
      record(`[${stamp()}] unreadable punch body from ${who}`);
      return;
    }
    record(`[${stamp()}] punch body: ${body.trim()}`);
    if (!p.userId) {
      record(`[${stamp()}] punch with no userId (face not matched to a user), not forwarded`);
      return;
    }
    forwardPunch(p);
  });

  socket.on('close', () => record(`[${stamp()}] close ${who}`));
  socket.on('error', (err) => record(`[${stamp()}] error ${who} ${err.message}`));
  socket.setTimeout(30000, () => socket.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  record(`[${stamp()}] listening on 0.0.0.0:${PORT}, forwarding ${FORWARD ? 'ON' : 'OFF'}, logging to ${logFile}`);
});
