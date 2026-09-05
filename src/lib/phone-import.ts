// Parsing for the bulk phone paste.
//
// Its own module so the dialog exports only a component (react-refresh) and so
// the parsing — which is where the fiddly cases live — can be unit tested
// without rendering anything.

export interface StaffLite {
  id: string;
  employee_id: string;
  full_name: string;
  phone: string | null;
}

type Parsed = {
  code: string;
  digits: string;
  staff?: StaffLite;
  problem?: string;
  unchanged?: boolean;
};

const digitsOf = (v: string) => v.replace(/\D/g, '');

/** Split a pasted block into code/number pairs. */
export function parsePhoneImport(text: string, staff: StaffLite[]): Parsed[] {
  const byCode = new Map(staff.map((s) => [s.employee_id.trim().toLowerCase(), s]));
  const seen = new Map<string, string>();
  for (const s of staff) {
    const d = digitsOf(s.phone ?? '');
    if (d) seen.set(d, s.employee_id);
  }

  const out: Parsed[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Tab, comma, semicolon or run of spaces — whatever the paste brought.
    const parts = line.split(/[\t,;]+|\s{2,}|\s+/).filter(Boolean);
    if (parts.length < 2) {
      out.push({ code: line, digits: '', problem: 'Need an employee code and a number' });
      continue;
    }
    const code = parts[0];
    const digits = digitsOf(parts.slice(1).join(''));
    const match = byCode.get(code.trim().toLowerCase());

    if (!match) { out.push({ code, digits, problem: 'No employee with this code' }); continue; }
    if (digits.length < 10) { out.push({ code, digits, staff: match, problem: 'Needs 10 digits' }); continue; }
    if (digitsOf(match.phone ?? '') === digits) {
      out.push({ code, digits, staff: match, unchanged: true });
      continue;
    }
    const clash = seen.get(digits);
    if (clash && clash !== match.employee_id) {
      out.push({ code, digits, staff: match, problem: `Already used by ${clash}` });
      continue;
    }
    seen.set(digits, match.employee_id);
    out.push({ code, digits, staff: match });
  }
  return out;
}
