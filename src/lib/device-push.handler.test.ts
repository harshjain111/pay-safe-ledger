import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal stand-in for the Supabase client: enough of the query builder for
// api/device-push.ts, recording what it writes.
const state = {
  device: null as Record<string, unknown> | null,
  staff: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self; b.eq = self; b.or = self;
  b.maybeSingle = async () => ({ data: table === 'biometric_devices' ? state.device : null, error: null });
  b.update = (v: Record<string, unknown>) => { state.updates.push({ table, ...v }); return { eq: async () => ({ error: null }) }; };
  b.upsert = async (v: Record<string, unknown>) => { state.upserts.push({ table, ...v }); return { error: null }; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: table === 'staff' ? state.staff : [], error: null });
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => { state.rpcs.push({ fn, args }); return { data: 'check-in', error: null }; },
  }),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

const { POST } = await import('../../api/device-push');

const SERIAL = '0EE588586859C013';
function push(body: string, code = 'realtime_glog', token = 'f7ac1b2a42afd47fe0d551f2b0dbeda7') {
  return POST(new Request('https://x/AIData.aspx', {
    method: 'POST',
    headers: { request_code: code, dev_id: SERIAL, trans_id: 'RTLogSend', token, 'Content-Type': 'application/json' },
    body,
  }));
}
const PUNCH = '{"doorMode":"open","inOut":"IN","ioMode":10,"time":"20261010175206","userId":"1","verifyMode":"Fp"}';

beforeEach(() => {
  state.device = { id: 'dev-1', is_active: true, push_token_hash: null, organization_id: 'org-1' };
  state.staff = [{ id: 'staff-1', employee_id: 'EMPMV0XQU7Q132', device_user_id: '1' }];
  state.updates = []; state.upserts = []; state.rpcs = [];
});

describe('api/device-push', () => {
  it('records a punch with the device time and acknowledges it', async () => {
    const res = await push(PUNCH);
    expect(res.headers.get('response_code')).toBe('OK');
    expect(res.headers.get('trans_id')).toBe('RTLogSend');
    expect(state.rpcs).toEqual([{ fn: 'apply_device_punch', args: expect.objectContaining({
      _staff_id: 'staff-1', _device_id: 'dev-1', _ts: '2026-10-10T12:22:06.000Z', _method: 'biometric',
    }) }]);
    // token pinned on first contact
    expect(state.updates.some((u) => typeof u.push_token_hash === 'string')).toBe(true);
  });

  it('matches the employee code case-insensitively (terminal keeps "edl026")', async () => {
    state.staff = [
      { id: 'staff-x', employee_id: 'EDLX26', device_user_id: null },
      { id: 'staff-26', employee_id: 'EDL026', device_user_id: null },
    ];
    const res = await push(PUNCH.replace('"userId":"1"', '"userId":"edl026"').replace('"Fp"', '"Face"'));
    expect(res.headers.get('response_code')).toBe('OK');
    expect(state.rpcs).toEqual([{ fn: 'apply_device_punch', args: expect.objectContaining({
      _staff_id: 'staff-26', _method: 'face',
    }) }]);
    expect(state.upserts).toHaveLength(0);
  });

  it('refuses an unregistered terminal (so it keeps the punch and retries)', async () => {
    state.device = null;
    const res = await push(PUNCH);
    expect(res.status).toBe(403);
    expect(res.headers.get('response_code')).toBe('ERROR');
    expect(state.rpcs).toHaveLength(0);
  });

  it('refuses a terminal whose token does not match the pinned one', async () => {
    state.device = { ...state.device, push_token_hash: 'something-else' };
    const res = await push(PUNCH);
    expect(res.headers.get('response_code')).toBe('ERROR');
    expect(state.rpcs).toHaveLength(0);
  });

  it('keeps a punch for an unknown User ID and still acknowledges it', async () => {
    state.staff = [];
    const res = await push(PUNCH);
    expect(res.headers.get('response_code')).toBe('OK');
    expect(state.upserts).toEqual([expect.objectContaining({
      table: 'device_unmatched_punches', device_user_id: '1', ts: '2026-10-10T12:22:06.000Z',
    })]);
  });

  it('acknowledges an unmatched face (empty userId) without recording it', async () => {
    const res = await push('{"inOut":"IN","time":"20261009145935","userId":"","verifyMode":"Face"}');
    expect(res.headers.get('response_code')).toBe('OK');
    expect(state.rpcs).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });

  it('acknowledges enrolment uploads without storing them', async () => {
    const res = await push('{"userId":"1","fp":"AAAA"}', 'realtime_enroll_data');
    expect(res.headers.get('response_code')).toBe('OK');
    expect(state.rpcs).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });
});
