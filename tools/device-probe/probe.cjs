#!/usr/bin/env node
// ===========================================================================
// Secureye S-FB5K / ZK-family terminal probe.
//
// Answers the only question that matters before any integration is built:
// does this device answer on its LAN port, and what does its firmware admit
// to supporting -- users, fingerprint templates, faces?
//
// Run it on a PC on the SAME network as the terminal. No npm install: it
// speaks the protocol directly over a plain TCP socket.
//
//     node probe.cjs 192.168.1.201
//     node probe.cjs 192.168.1.201 4370
//
// It only READS. It does not enrol, delete, or change anything on the device.
// ===========================================================================

const net = require('net');

const HOST = process.argv[2];
const PORT = Number(process.argv[3] || 4370);
if (!HOST) {
  console.error('Usage: node probe.cjs <device-ip> [port]   e.g. node probe.cjs 192.168.1.201');
  process.exit(1);
}

const CMD = {
  CONNECT: 1000, EXIT: 1001, ENABLEDEVICE: 1002, DISABLEDEVICE: 1003,
  ACK_OK: 2000, ACK_ERROR: 2005, ACK_UNAUTH: 2005,
  DEVICE: 11, GET_FREE_SIZES: 50, DATA_WRRQ: 1503,
  PREPARE_DATA: 1500, DATA: 1501,
};
const USHRT_MAX = 65535;
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

// The protocol's own 16-bit ones-complement checksum over the packet.
function checksum(buf) {
  let sum = 0, i = 0;
  while (i + 1 < buf.length) { sum += buf.readUInt16LE(i); i += 2; if (sum > USHRT_MAX) sum -= USHRT_MAX; }
  if (i < buf.length) sum += buf[i];
  while (sum > USHRT_MAX) sum -= USHRT_MAX;
  sum = ~sum;
  while (sum < 0) sum += USHRT_MAX;
  return sum & 0xffff;
}

function packet(command, sessionId, replyId, data) {
  const body = Buffer.alloc(8 + data.length);
  body.writeUInt16LE(command, 0);
  body.writeUInt16LE(0, 2);
  body.writeUInt16LE(sessionId, 4);
  body.writeUInt16LE(replyId, 6);
  data.copy(body, 8);
  body.writeUInt16LE(checksum(body), 2);
  const out = Buffer.alloc(8 + body.length);
  TCP_MAGIC.copy(out, 0);
  out.writeUInt32LE(body.length, 4);
  body.copy(out, 8);
  return out;
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    const t = setTimeout(() => { s.destroy(); reject(new Error('timed out after 6s')); }, 6000);
    s.once('error', (e) => { clearTimeout(t); reject(e); });
    s.connect(PORT, HOST, () => { clearTimeout(t); resolve(s); });
  });
}

// Reads one reply. Long answers arrive as PREPARE_DATA then a payload, so the
// caller gets both the reply code and whatever bulk data followed.
function exchange(sock, command, sessionId, replyId, data = Buffer.alloc(0), waitMs = 2500) {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk) => { buf = Buffer.concat([buf, chunk]); };
    sock.on('data', onData);
    sock.write(packet(command, sessionId, replyId, data));
    setTimeout(() => {
      sock.removeListener('data', onData);
      if (buf.length < 16) return resolve({ ok: false, raw: buf });
      const size = buf.readUInt32LE(4);
      const reply = buf.readUInt16LE(8);
      const session = buf.readUInt16LE(12);
      resolve({ ok: reply === CMD.ACK_OK, reply, session, size, payload: buf.slice(16), raw: buf });
    }, waitMs);
  });
}

const strip = (b) => b.toString('latin1').replace(/\0.*$/, '').trim();

(async () => {
  console.log(`\n  Probing ${HOST}:${PORT} ...\n`);
  let sock;
  try {
    sock = await connectSocket();
  } catch (e) {
    console.log(`  TCP connect FAILED: ${e.message}`);
    console.log(`\n  That means one of:`);
    console.log(`    - the IP is wrong (check Menu > Comm > Ethernet on the device)`);
    console.log(`    - this PC is on a different subnet / VLAN from the terminal`);
    console.log(`    - a firewall is blocking outbound ${PORT}`);
    console.log(`    - the device uses a non-standard port\n`);
    process.exit(2);
  }
  console.log(`  TCP connect        OK`);

  let replyId = 0;
  const hello = await exchange(sock, CMD.CONNECT, 0, replyId++);
  if (!hello.ok) {
    console.log(`  Handshake          REFUSED (reply code ${hello.reply ?? 'none'})`);
    console.log(`\n  The port is open but the device did not accept the session.`);
    console.log(`  Most likely it has a Comm Key / password set:`);
    console.log(`    Menu > Comm > Security > Comm Key  (set it to 0 to test)\n`);
    sock.destroy();
    process.exit(3);
  }
  const session = hello.session;
  console.log(`  Handshake          OK   (session ${session})`);
  console.log(`  --- the device says ---`);

  for (const key of ['~DeviceName', '~SerialNumber', 'FirmVer', '~Platform', '~ZKFPVersion',
                     'FaceFunOn', '~IsOnlyRFMachine', 'WorkCode', 'MaxUserCount', 'MaxFingerCount', 'MaxFaceCount']) {
    const r = await exchange(sock, CMD.DEVICE, session, replyId++, Buffer.from(key, 'latin1'), 900);
    const val = r.payload && r.payload.length ? strip(r.payload) : '';
    console.log(`    ${key.padEnd(18)} ${val || '(not supported)'}`);
  }

  // GET_FREE_SIZES returns 20 little-endian int32s, then 3 more for faces on
  // firmwares that have the face engine at all -- which is itself the answer
  // to whether this unit can do face.
  const sizes = await exchange(sock, CMD.GET_FREE_SIZES, session, replyId++, Buffer.alloc(0), 1200);
  if (sizes.ok && sizes.payload.length >= 80) {
    const n = (i) => sizes.payload.readInt32LE(i * 4);
    console.log(`  --- stored / capacity ---`);
    console.log(`    users              ${n(4)} of ${n(15)}`);
    console.log(`    fingerprints       ${n(6)} of ${n(14)}`);
    console.log(`    attendance logs    ${n(8)} of ${n(16)}`);
    console.log(`    cards              ${n(12)}`);
    if (sizes.payload.length >= 92) {
      console.log(`    faces              ${n(20)} of ${n(22)}`);
    } else {
      console.log(`    faces              (this firmware reports no face engine)`);
    }
  } else {
    console.log(`  --- stored / capacity ---`);
    console.log(`    (device did not answer GET_FREE_SIZES)`);
  }

  await exchange(sock, CMD.EXIT, session, replyId++, Buffer.alloc(0), 500);
  sock.destroy();
  console.log(`\n  Done. Send me this whole output.\n`);
})();
