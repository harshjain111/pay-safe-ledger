# Biometric terminal → website (direct cloud push)

The terminal (BioMax N-series NF22, firmware model "R6") sends every punch
straight to the website over the internet. No PC is needed on its network.

```
terminal ──HTTPS POST /AIData.aspx──▶ Vercel  api/device-push.ts
                                        │  identifies the terminal by serial (dev_id)
                                        │  replies `response_code: OK` (the terminal's ack)
                                        ▼
                         Supabase  apply_device_punch()  ──▶ punch_events
                                        │                   attendance_sessions
                                        ▼
                         Realtime ──▶ open browsers refresh (Attendance, dashboard)
```

## One-time setup

1. **Database** — `supabase db push` (applies `20261014120000_device_push.sql`).
2. **Vercel env vars** (Project → Settings → Environment Variables, Production):
   - `SUPABASE_URL` = `https://<project-id>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = the service-role key (never prefix with `VITE_`)
   - optional `DEVICE_TZ_OFFSET` = `+05:30` (the terminal's clock offset)
3. **Deploy.** Check `https://<your-domain>/AIData.aspx` in a browser — it should
   show `{"ok":true,"service":"device-push"}`.
4. **Register the terminal** — Settings → Hardware → Add device. Serial = the
   terminal's Device ID exactly (e.g. `0EE588586859C013`).
5. **Map people** — Biometric Enrolment → Enrol → *Device User ID* = the User ID
   the person has on the terminal (e.g. `1`). Leave it empty if the terminal uses
   the employee code itself.
6. **Terminal settings** — DHCP on; server = your domain (not an IP); port 443;
   SSL on; path `AIData.aspx` if asked; clock GMT+5:30.

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

- **Punches don't arrive, terminal keeps retrying**: Vercel → Logs, filter
  `device-push`. `unknown-device` = serial not registered or mistyped.
  `token-mismatch` = a different terminal is using that serial; regenerate the
  device key in Settings → Hardware to accept the new one.
- **User ID not linked**: the punch is kept in `device_unmatched_punches` and
  shown at the top of Biometric Enrolment. Enrol the person with that Device
  User ID and the waiting punches are added automatically.
- **TLS**: the terminal must send the domain name during the HTTPS handshake
  (SNI). If Vercel logs show nothing at all while the terminal says "server
  error", the firmware does not; then put the endpoint behind a host with its own
  IP address (a small VPS running the same code) instead of Vercel.

## Files

- `api/device-push.ts` — the endpoint (Vercel function)
- `vercel.json` — routes `/AIData.aspx` to it
- `supabase/migrations/20261014120000_device_push.sql` — `staff.device_user_id`,
  `biometric_devices.push_token_hash`, `device_unmatched_punches`,
  `apply_device_punch()`, `replay_unmatched_punches()`, realtime publication
- `src/hooks/useAttendanceLive.ts` — live refresh in the browser
- `tools/device-listener/listener.cjs` — the LAN listener used for diagnosis; not
  needed in production
