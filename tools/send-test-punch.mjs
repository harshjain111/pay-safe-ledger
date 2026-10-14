// Sends one fake terminal punch to the local endpoint (npm run device:local).
//
//   npm run device:punch                          -> user 1, now
//   npm run device:punch -- 1 0930                -> user 1, today 09:30
//   npm run device:punch -- 1 1730 0EE588586859C013 -> other serial
//
// Env: PUNCH_URL (default http://localhost:3000/AIData.aspx)

const [userId = '1', hhmm, serial = '0EE588586859C013'] = process.argv.slice(2);
const url = process.env.PUNCH_URL || 'http://localhost:3000/AIData.aspx';

// Device clock is IST; build "YYYYMMDDHHmmss" in +05:30 regardless of this PC's zone.
const ist = new Date(Date.now() + 330 * 60_000);
const pad = (n) => String(n).padStart(2, '0');
const day = `${ist.getUTCFullYear()}${pad(ist.getUTCMonth() + 1)}${pad(ist.getUTCDate())}`;
const clock = hhmm ? `${hhmm.replace(':', '').padStart(4, '0')}00` : `${pad(ist.getUTCHours())}${pad(ist.getUTCMinutes())}${pad(ist.getUTCSeconds())}`;
const time = day + clock;

const res = await fetch(url, {
  method: 'POST',
  headers: { request_code: 'realtime_glog', dev_id: serial, trans_id: `test-${Date.now()}` },
  body: JSON.stringify({ userId, time, inOut: 'IN', verifyMode: 'Fp' }),
});

console.log(`sent user ${userId} at ${time} (IST) from ${serial}`);
console.log(`ack: ${res.headers.get('response_code')}  status: ${res.status}  ${await res.text()}`);
