# Biometric terminal → attendance (direct push)

The terminal (BioMax N-series NF22, firmware model "R6") sends every punch over
the internet to a small relay server, which records it in Supabase. No PC is
needed on the terminal's network.

```
terminal ──HTTP POST <relay IP>:8090/AIData.aspx──▶ relay (tools/device-server, runs api/device-push.ts)
                                        │  identifies the terminal by serial (dev_id)
                                        │  replies `response_code: OK` (the terminal's ack)
                                        ▼
                         Supabase  apply_device_punch()  ──▶ punch_events
                                        │                   attendance_sessions
                                        ▼
                         Realtime ──▶ open browsers refresh (Attendance, dashboard)
```

**Why not the website (Vercel):** the same handler is also deployed at
`https://<site>/AIData.aspx`, but Vercel rewrites response header names —
`response_code` arrives as `Response-Code` — so the terminal never sees its ack
and re-sends the same punch forever. This terminal must use the relay, which
sends the headers exactly. (The terminal also only offers Push Server IP/Port.)

## One-time setup

1. **Database** — `supabase db push` (applies `20261014120000_device_push.sql`).
2. **Relay server** — follow `tools/device-server/README.md`; it ends by printing
   the IP and port to enter on the terminal.
3. **Register the terminal** — Settings → Hardware → Add device. Serial = the
   terminal's Device ID exactly (e.g. `0EE588586859C013`).
4. **Map people** — Biometric Enrolment → Enrol → *Device User ID* = the User ID
   the person has on the terminal (e.g. `1`). Leave it empty if the terminal uses
   the employee code itself (matched case-insensitively: `edl026` = `EDL026`).
5. **Terminal settings** — Push Server IP = the relay's IP; Push Server Port =
   `8090`; SSL off; clock GMT+5:30.

## How punches become attendance

The terminal reports every punch as "IN", so direction comes from timing (same
rules as `rebuild_sessions_by_gap`):

| Punch | Result |
|---|---|
| first of the day | check-in (session opens, shows "Present") |
| ≤ 5 min after the last punch | ignored (confirm-tap) |
| ≤ 12 h after the last punch | check-out (a later punch moves the check-out) |
| before 10:00, session still open, ≤ 20 h | joins last night's session (night shifts) |
| re-sent identical punch | ignored (`punch_events` is unique per device+time+person) |

## When something goes wrong

- **Punches don't arrive, terminal keeps retrying**: on the relay,
  `journalctl -u device-push -f`. `unknown-device` = serial not registered or
  mistyped. `token-mismatch` = a different terminal is using that serial;
  regenerate the device key in Settings → Hardware to accept the new one.
- **User ID not linked**: the punch is kept in `device_unmatched_punches` and
  shown at the top of Biometric Enrolment. Enrol the person with that Device
  User ID and the waiting punches are added automatically.

## Files

- `api/device-push.ts` — the handler (run by the relay; also deployed on Vercel)
- `tools/device-server/` — the relay: `server.ts`, build + install scripts
- `vercel.json` — routes `/AIData.aspx` to the handler on the website
- `supabase/migrations/20261014120000_device_push.sql` — `staff.device_user_id`,
  `biometric_devices.push_token_hash`, `device_unmatched_punches`,
  `apply_device_punch()`, `replay_unmatched_punches()`, realtime publication
- `src/hooks/useAttendanceLive.ts` — live refresh in the browser
- `tools/device-listener/listener.cjs` — the LAN listener used for diagnosis; not
  needed in production
