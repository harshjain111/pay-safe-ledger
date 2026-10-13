#!/usr/bin/env node
// ===========================================================================
// Push-data listener for the BioMax N-series (NF22) / fk_device terminal.
//
// The device POSTs each record to this PC over the LAN and keeps re-sending the
// SAME record (head of its upload queue) until it gets an acknowledgement it
// accepts. Newer punches wait in the queue behind it. So the ack format is
// what decides whether new punches ever arrive.
//
// For each request:
//   - headers + a body preview are logged to captures/ (git-ignored; enrolment
//     pushes contain biometric data, delete those files once the format is settled);
//   - it is acknowledged (see ACK_MODE);
//   - realtime_glog punches with a userId are forwarded to ingest-punches using
//     the DEVICE's punch time (ingest-punches dedupes on device+ts+staff, so a
//     re-sent record can never create a second punch).
//   - connections that never complete a request are dumped raw (hex + ascii) so
//     we can see what the device actually sent.
//
// Environment (set in the shell before running):
//   INGEST_URL         https://<project-id>.supabase.co/functions/v1/ingest-punches
//   SUPABASE_ANON_KEY  the project's anon (publishable) key
//   DEVICE_KEY         the device's API key, shown once in Settings > Hardware
//   DEVICE_TZ          device clock's UTC offset, default +05:30
//   ACK_MODE           both (default) | fk | json  — see reply() below
//
// Usage:
//   node listener.cjs            <- listens on 0.0.0.0:9001
//   node listener.cjs 9001       <- explicit port
// ===========================================================================

const net = require('net');
const tls = require('tls');
const { Duplex } = require('stream');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 9001);
const INGEST_URL = process.env.INGEST_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DEVICE_KEY = process.env.DEVICE_KEY || '';
const DEVICE_TZ = process.env.DEVICE_TZ || '+05:30';
const ACK_MODE = (process.env.ACK_MODE || 'both').toLowerCase();
const FORWARD = Boolean(INGEST_URL && ANON_KEY && DEVICE_KEY);

// raw_refs already forwarded successfully this run (saves needless calls; the
// database is the real dedupe).
const forwarded = new Set();

const OUT_DIR = path.join(__dirname, 'captures');
fs.mkdirSync(OUT_DIR, { recursive: true });

const stamp = () => new Date().toISOString();
const logFile = path.join(OUT_DIR, `push-${new Date().toISOString().slice(0, 10)}.log`);

function record(line) {
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function hexAscii(buf, max = 512) {
  const b = buf.slice(0, max);
  const ascii = [...b].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('');
  return `  hex:   ${b.toString('hex')}\n  ascii: ${ascii}${buf.length > max ? ` …(+${buf.length - max} bytes)` : ''}`;
}

// Find the end of the HTTP head. Some firmware ends lines with bare \n.
function findHeadEnd(buf) {
  const crlf = buf.indexOf('\r\n\r\n');
  if (crlf !== -1) return { at: crlf, sep: 4 };
  const lf = buf.indexOf('\n\n');
  if (lf !== -1) return { at: lf, sep: 2 };
  return null;
}

function header(head, name) {
  const m = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(head);
  return m ? m[1].trim() : '';
}

// The fk_device push protocol acknowledges in the HTTP *headers*:
//   response_code: OK   (+ trans_id echoed, cmd_code empty)
// The previous listener only sent a JSON body, which the terminal does not
// treat as an ack — so it re-sent the same queued record forever.
//   ACK_MODE=both  headers + JSON body (default; safe for either style)
//   ACK_MODE=fk    headers + empty body
//   ACK_MODE=json  old behaviour (JSON body only) — for comparison only
function reply(socket, requestCode, transId) {
  const json = JSON.stringify({ ret: requestCode, result: true, count: 1 });
  const body = Buffer.from(ACK_MODE === 'fk' ? '' : json);
  const fkHeaders =
    ACK_MODE === 'json'
      ? ''
      : `response_code: OK\r\ntrans_id: ${transId}\r\ncmd_code: \r\n`;
  const type = ACK_MODE === 'fk' ? 'application/octet-stream' : 'application/json';
  socket.write(
    `HTTP/1.1 200 OK\r\n${fkHeaders}Content-Type: ${type}\r\n` +
      `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n`
  );
  socket.end(body);
}

// "20261009145935" -> "2026-10-09T14:59:35+05:30"
function deviceTimeToIso(t) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${DEVICE_TZ}`;
}

async function forwardPunch(p, devId) {
  const ts = deviceTimeToIso(p.time);
  if (!ts) {
    record(`[${stamp()}] punch has unreadable time "${p.time}", not forwarded`);
    return;
  }
  const rawRef = `${devId || 'dev'}|${p.time}|${p.userId}|${p.inOut}`;
  if (forwarded.has(rawRef)) {
    record(`[${stamp()}] already forwarded ${rawRef}`);
    return;
  }
  if (!FORWARD) {
    record(`[${stamp()}] not forwarded (set INGEST_URL, SUPABASE_ANON_KEY, DEVICE_KEY): ${rawRef} @ ${ts}`);
    return;
  }

  const body = {
    events: [
      {
        employee_id: p.userId,
        direction: p.inOut === 'OUT' ? 'out' : 'in',
        ts, // device punch time (device clock is correct)
        method: p.verifyMode === 'Face' ? 'face' : 'biometric',
        raw_ref: rawRef,
      },
    ],
  };

  try {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: ANON_KEY, 'x-device-key': DEVICE_KEY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) forwarded.add(rawRef);
    record(`[${stamp()}] forwarded ${rawRef} -> HTTP ${res.status} ${text}`);
  } catch (err) {
    record(`[${stamp()}] forward failed for ${rawRef}: ${err.message}`);
  }
}

function handle(socket, who, proto) {
  let buf = Buffer.alloc(0);
  let answered = false;
  record(`[${stamp()}] connect ${who} (${proto})`);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (answered) return;
    const he = findHeadEnd(buf);
    if (!he) return; // headers not complete yet

    const head = buf.slice(0, he.at).toString('latin1');
    const len = Number(header(head, 'content-length') || 0);
    const need = he.at + he.sep + len;
    if (buf.length < need) return; // body still arriving

    answered = true;
    const body = buf.slice(he.at + he.sep, need);
    const requestCode = header(head, 'request_code') || '(none)';
    const transId = header(head, 'trans_id');
    const devId = header(head, 'dev_id');

    record(`[${stamp()}] request ${requestCode} from ${who} (${need} bytes) dev_id=${devId} trans_id=${transId}`);
    // Full head for everything; body only for small requests (enrol data is biometric).
    record(`  head: ${head.replace(/\r?\n/g, ' | ')}`);
    if (requestCode !== 'realtime_enroll_data') record(`  body: ${body.toString('latin1').slice(0, 400)}`);

    reply(socket, requestCode, transId);

    if (requestCode !== 'realtime_glog') return;
    let p;
    try {
      // Body may be bare JSON, or JSON preceded by a length/binary prefix.
      const s = body.toString('latin1');
      p = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    } catch {
      record(`[${stamp()}] unreadable punch body from ${who}`);
      return;
    }
    if (!p.userId) {
      record(`[${stamp()}] punch at ${p.time} with no userId (face/finger not matched), acked, not forwarded`);
      return;
    }
    forwardPunch(p, devId);
  });

  socket.on('close', () => {
    if (!answered && buf.length) {
      record(`[${stamp()}] close ${who} WITHOUT a complete request; received ${buf.length} bytes:\n${hexAscii(buf)}`);
    } else if (!answered) {
      record(`[${stamp()}] close ${who} — device sent nothing`);
    } else {
      record(`[${stamp()}] close ${who}`);
    }
  });
  socket.on('error', (err) => record(`[${stamp()}] error ${who} ${err.message}`));
  socket.setTimeout(30000, () => socket.destroy());
}

// The terminal may connect over plain HTTP or HTTPS (its "SSL" option). We sniff
// the first byte: 0x16 is a TLS handshake, so that connection is decrypted with
// the self-signed cert in ./certs before being handled like any other request.
const CERT_DIR = path.join(__dirname, 'certs');
let secureContext = null;
try {
  secureContext = tls.createSecureContext({
    key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')),
    cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')),
    minVersion: 'TLSv1',
  });
} catch (err) {
  console.warn(`No certs in ${CERT_DIR}; HTTPS connections will not be decrypted (${err.message})`);
}

const server = net.createServer((socket) => {
  const who = `${socket.remoteAddress}:${socket.remotePort}`;
  socket.on('error', () => {});
  socket.once('data', (first) => {
    if (first[0] === 0x16 && secureContext) {
      record(`[${stamp()}] ${who} started an HTTPS handshake`);
      // Feed the already-read bytes plus the rest of the socket through a plain
      // stream, so TLS sees the handshake from its first byte.
      const pipe = new Duplex({
        read() {},
        write(chunk, enc, cb) { socket.write(chunk, cb); },
        final(cb) { socket.end(); cb(); },
        destroy(err, cb) { socket.destroy(); cb(err); },
      });
      pipe.push(first);
      socket.on('data', (c) => pipe.push(c));
      socket.on('end', () => pipe.push(null));
      socket.on('close', () => pipe.destroy());
      pipe.remoteAddress = socket.remoteAddress;
      const t = new tls.TLSSocket(pipe, { isServer: true, secureContext });
      t.once('secure', () => handle(t, who, 'https'));
      t.on('error', (err) =>
        record(`[${stamp()}] HTTPS error ${who}: ${err.message} (if this is a certificate error, the device rejects the self-signed cert)`)
      );
      t.setTimeout(30000, () => t.destroy());
    } else {
      socket.pause();
      socket.unshift(first);
      handle(socket, who, 'http');
      socket.resume();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  record(
    `[${stamp()}] listening on 0.0.0.0:${PORT}, ack=${ACK_MODE}, forwarding ${FORWARD ? 'ON' : 'OFF'}, logging to ${logFile}`
  );
});
