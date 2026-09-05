import { describe, it, expect } from 'vitest';
import { parsePhoneImport } from '@/lib/phone-import';

const staff = [
  { id: '1', employee_id: 'K2H001', full_name: 'Asha', phone: null },
  { id: '2', employee_id: 'K2H002', full_name: 'Bilal', phone: '9000000002' },
  { id: '3', employee_id: 'K2H003', full_name: 'Chandni', phone: null },
];

describe('parsePhoneImport', () => {
  it('reads the separators a spreadsheet paste actually produces', () => {
    const rows = parsePhoneImport(
      ['K2H001\t9876543210', 'K2H003, 9876543211'].join('\n'),
      staff,
    );
    expect(rows.map((r) => [r.code, r.digits])).toEqual([
      ['K2H001', '9876543210'],
      ['K2H003', '9876543211'],
    ]);
    expect(rows.every((r) => !r.problem)).toBe(true);
  });

  it('strips formatting from the number, so +91 and spaces still match', () => {
    const [row] = parsePhoneImport('K2H001  +91 98765 43210', staff);
    expect(row.digits).toBe('919876543210');
    expect(row.problem).toBeUndefined();
  });

  it('skips an unknown code rather than guessing', () => {
    const [row] = parsePhoneImport('NOPE 9876543210', staff);
    expect(row.staff).toBeUndefined();
    expect(row.problem).toMatch(/No employee/);
  });

  it('rejects a number already held by someone else, and points at who', () => {
    const [row] = parsePhoneImport('K2H001 9000000002', staff);
    expect(row.problem).toContain('K2H002');
  });

  it('catches a number repeated twice within the same paste', () => {
    const rows = parsePhoneImport('K2H001 9876543210\nK2H003 9876543210', staff);
    expect(rows[0].problem).toBeUndefined();
    expect(rows[1].problem).toMatch(/Already used/);
  });

  it('marks a row unchanged when it already holds that number', () => {
    const [row] = parsePhoneImport('K2H002 9000000002', staff);
    expect(row.unchanged).toBe(true);
    expect(row.problem).toBeUndefined();
  });

  it('flags a short number instead of saving it', () => {
    const [row] = parsePhoneImport('K2H001 98765', staff);
    expect(row.problem).toMatch(/10 digits/);
  });

  it('ignores blank lines and a line with no number', () => {
    const rows = parsePhoneImport('\n\nK2H001\n', staff);
    expect(rows).toHaveLength(1);
    expect(rows[0].problem).toMatch(/employee code and a number/);
  });
});
