import { describe, it, expect } from 'vitest';
import {
  parseDeviceTime,
  extractJson,
  toPunch,
  punchMethod,
  ackHeaders,
} from '../../api/device-push';

describe('parseDeviceTime', () => {
  it('reads the terminal clock as IST', () => {
    expect(parseDeviceTime('20261010175206')?.toISOString()).toBe('2026-10-10T12:22:06.000Z');
  });
  it('honours a different offset', () => {
    expect(parseDeviceTime('20261010175206', '+00:00')?.toISOString()).toBe('2026-10-10T17:52:06.000Z');
  });
  it('rejects malformed values', () => {
    expect(parseDeviceTime('')).toBeNull();
    expect(parseDeviceTime('2026-10-10 17:52')).toBeNull();
    expect(parseDeviceTime('20261310175206')).toBeNull(); // month 13
    expect(parseDeviceTime('20261010175206', 'IST')).toBeNull();
  });
});

describe('extractJson / toPunch', () => {
  const body =
    '{"doorMode":"open","inOut":"IN","ioMode":10,"time":"20261010175206","userId":"1","verifyMode":"Fp"}';

  it('parses the real push body', () => {
    expect(toPunch(extractJson(body))).toEqual({
      userId: '1',
      time: '20261010175206',
      inOut: 'IN',
      verifyMode: 'Fp',
    });
  });
  it('tolerates a binary prefix and trailing bytes', () => {
    expect(extractJson('\u0000b\u0000\u0000' + body + '\u0000')).toMatchObject({ userId: '1' });
  });
  it('keeps an empty userId (unmatched face) so the caller can ack it', () => {
    const p = toPunch(extractJson('{"time":"20261009145935","userId":"","verifyMode":"Face"}'));
    expect(p?.userId).toBe('');
  });
  it('accepts a numeric userId', () => {
    expect(toPunch({ time: '20261010175206', userId: 7 })?.userId).toBe('7');
  });
  it('returns null without a time, or for non-JSON', () => {
    expect(toPunch(extractJson('{"userId":"1"}'))).toBeNull();
    expect(extractJson('not json')).toBeNull();
    expect(extractJson('[1,2]')).toBeNull();
  });
});

describe('punchMethod', () => {
  it('maps Face to face and everything else to biometric', () => {
    expect(punchMethod('Face')).toBe('face');
    expect(punchMethod('Fp')).toBe('biometric');
    expect(punchMethod(undefined)).toBe('biometric');
  });
});

describe('ackHeaders', () => {
  it('acknowledges in the headers the terminal reads', () => {
    expect(ackHeaders('RTLogSend')).toMatchObject({ response_code: 'OK', trans_id: 'RTLogSend', cmd_code: '' });
    expect(ackHeaders('x', false).response_code).toBe('ERROR');
  });
});
