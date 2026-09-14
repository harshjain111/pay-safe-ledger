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
//     node probe.cjs 192.168.1.201 4370 123456     <- Comm Password, if set
//
// The port and password are the ones on the device under Menu > Comm:
// "TCP Port" (default 4370) and "Comm Password".
//
// It only READS. It does not enrol, delete, or change anything on the device.
// ===========================================================================

const net = require('net');

const HOST = process.argv[2];
const PORT = Number(process.argv[3] || 4370);
// Menu > Comm > Comm Password (the protocol calls it the comm key). 0 or
// absent means the device accepts an unauthenticated session.
const COMM_KEY = Number(process.argv[4] || 0);

if (!HOST) {
  console.error('Usage: node probe.cjs <device-ip> [tcp-port] [comm-password]');
  console.error('   eg: node probe.cjs 192.168.1.201');
  console.error('   eg: node probe.cjs 192.168.1.201 4370 123456');
  process.exit(1);
}

const CMD = {
  CONNECT: 1000, EXIT: 1001, ENABLEDEVICE: 1002, DISABLEDEVICE: 1003,
  AUTH: 1102, DEVICE: 11, GET_FREE_SIZES: 50,
  ACK_OK: 2000, ACK_ERROR: 2001, ACK_DATA: 2002, ACK_UNAUTH: 2005,
};
const USHRT_MAX = 65535;
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

// The protocol's own 16-bit ones-complement checksum over the packet.
function checksum(buf) {
  let sum = 0, i = 0;
  while (i + 1 < buf.length) {
    sum += buf.readUInt16LE(i);
    i += 2;
    if (sum > USHRT_MAX) sum -= USHRT_MAX;
  }
  if (i < buf.length) sum += buf[i];
  while (sum > USHRT_MAX) sum -= USHRT_MAX;
  sum = ~sum;
  while (sum < 0) sum += USHRT_MAX;
  return sum & 0xffff;
}

// The device will not take the Comm Password as plain text. It expects it
// folded bit by bit, offset by the session id, XORed against "ZKSO", the two
// halves swapped, then XORed against a tick byte. This is that transform.
function commKey(key, sessionId, ticks = 50) {
  let k = 0;
  for (let i = 0; i < 32; i++) k = (key & (1 << i)) ? ((k << 1) | 1) : (k << 1);
  k = (k + sessionId) >>> 0;

  const b = Buffer.alloc(4);
  b.writeUInt32LE(k, 0);
  b[0] ^= 'Z'.charCodeAt(0);
  b[1] ^= 'K'.charCodeAt(0);
  b[2] ^= 'S'.charCodeAt(0);
  b[3] ^= 'O'.charCodeAt(0);

  const swapped = Buffer.from([b[2], b[3], b[0], b[1]]);
  const B = ticks & 0xff;
  return Buffer.from([swapped[0] ^ B, swapped[1] ^ B, swapped[2], swapped[3] ^ B]);
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

function exchange(sock, command, sessionId, replyId, data = Buffer.alloc(0), waitMs = 2500) {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk) => { buf = Buffer.concat([buf, chunk]); };
    sock.on('data', onData);
    sock.write(packet(command, sessionId, replyId, data));
    setTimeout(() => {
      sock.removeListener('data', onData);
      if (buf.length < 16) return resolve({ ok: false, raw: buf });
      resolve({
        ok: buf.readUInt16LE(8) === CMD.ACK_OK,
        reply: buf.readUInt16LE(8),
        session: buf.readUInt16LE(12),
        size: buf.readUInt32LE(4),
        payload: buf.slice(16),
        raw: buf,
      });
    }, waitMs);
  });
}

const strip = (b) => b.toString('latin1').replace(/\0.*$/, '').trim();

(async () => {
  console.log('');
  console.log('  Probing ' + HOST + ':' + PORT + (COMM_KEY ? ' (with comm password)' : '') + ' ...');
  console.log('');

  let sock;
  try {
    sock = await connectSocket();
  } catch (e) {
    console.log('  TCP connect        FAILED: ' + e.message);
    console.log('');
    console.log('  That means one of:');
    console.log('    - the IP is wrong           (Menu > Comm > Ethernet)');
    console.log('    - the port is wrong         (Menu > Comm > TCP Port)');
    console.log('    - this PC is on a different subnet / VLAN from the terminal');
    console.log('    - a firewall is blocking outbound ' + PORT);
    console.log('');
    process.exit(2);
  }
  console.log('  TCP connect        OK');

  let replyId = 0;
  let hello = await exchange(sock, CMD.CONNECT, 0, replyId++);

  // A device with a Comm Password answers CONNECT with UNAUTH and wants the
  // scrambled key back before it will open the session.
  if (!hello.ok && hello.reply === CMD.ACK_UNAUTH) {
    if (!COMM_KEY) {
      console.log('  Handshake          NEEDS THE COMM PASSWORD');
      console.log('');
      console.log('  The device is protected. Read it from');
      console.log('    Menu > Comm > Comm Password');
      console.log('  then run again with it as the third argument:');
      console.log('    node probe.cjs ' + HOST + ' ' + PORT + ' <password>');
      console.log('');
      sock.destroy();
      process.exit(4);
    }
    console.log('  Handshake          password required, authenticating...');
    hello = await exchange(sock, CMD.AUTH, hello.session, replyId++, commKey(COMM_KEY, hello.session));
    if (!hello.ok) {
      console.log('  Comm Password      REJECTED (reply code ' + (hello.reply || 'none') + ')');
      console.log('');
      console.log('  Check the value under Menu > Comm > Comm Password.');
      console.log('');
      sock.destroy();
      process.exit(5);
    }
    console.log('  Comm Password      ACCEPTED');
  }

  if (!hello.ok) {
    console.log('  Handshake          REFUSED (reply code ' + (hello.reply || 'none') + ')');
    console.log('');
    console.log('  The port is open but the device would not open a session.');
    console.log('  If a Comm Password is set, pass it:');
    console.log('    node probe.cjs ' + HOST + ' ' + PORT + ' <password>');
    console.log('');
    sock.destroy();
    process.exit(3);
  }

  const session = hello.session;
  console.log('  Handshake          OK   (session ' + session + ')');
  console.log('  --- the device says ---');

  const KEYS = [
    '~DeviceName', '~SerialNumber', 'FirmVer', '~Platform', '~ZKFPVersion',
    'FaceFunOn', 'FaceVersion', '~IsOnlyRFMachine', 'WorkCode',
    'MaxUserCount', 'MaxFingerCount', 'MaxFaceCount', 'DeviceID',
  ];
  for (const key of KEYS) {
    const r = await exchange(sock, CMD.DEVICE, session, replyId++, Buffer.from(key, 'latin1'), 900);
    const val = r.payload && r.payload.length ? strip(r.payload) : '';
    console.log('    ' + key.padEnd(18) + (val || '(not supported)'));
  }

  // GET_FREE_SIZES returns 20 little-endian int32s, then 3 more for faces on
  // firmwares that have the face engine at all -- which is itself the answer
  // to whether this unit can do face over the wire.
  const sizes = await exchange(sock, CMD.GET_FREE_SIZES, session, replyId++, Buffer.alloc(0), 1200);
  console.log('  --- stored / capacity ---');
  if (sizes.ok && sizes.payload.length >= 80) {
    const n = (i) => sizes.payload.readInt32LE(i * 4);
    console.log('    users              ' + n(4) + ' of ' + n(15));
    console.log('    fingerprints       ' + n(6) + ' of ' + n(14));
    console.log('    attendance logs    ' + n(8) + ' of ' + n(16));
    console.log('    cards              ' + n(12));
    if (sizes.payload.length >= 92) {
      console.log('    faces              ' + n(20) + ' of ' + n(22));
    } else {
      console.log('    faces              (this firmware reports no face engine)');
    }
  } else {
    console.log('    (device did not answer GET_FREE_SIZES)');
  }

  await exchange(sock, CMD.EXIT, session, replyId++, Buffer.alloc(0), 500);
  sock.destroy();
  console.log('');
  console.log('  Done. Send me this whole output.');
  console.log('');
})();
