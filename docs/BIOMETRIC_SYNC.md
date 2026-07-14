# Biometric attendance sync — design & prerequisites

**Goal (from the owner):** pull punches from the existing biometric attendance
system into VIBRND HR BUDDY **fully automatically** — API-pull first, DB/export
sync as fallback — with **no data loss, no delay, and no manual syncing**.

## Update — device list received (2026-07-14)

The ADMS console screenshot confirms the setup:
- **eSSL / ZKTeco ADMS push server** (columns T Stamp / Op Stamp / altinout /
  Validate Status / Last Ping; device serials `PHY72447013xx`). Almost certainly
  **eSSL eTimeTrackLite** (SQL Server DB `etimetracklite1`, table `DeviceLogs`).
- 5 devices: **Mirosh** and **Reality** are **online and pinging today** (real-time
  push is live); **Ballu** offline since Feb; **Mobile**/**TD** are stale/test rows.
- **Reachable from outside the office** (public IP:port) → a cloud puller can reach
  it; no on-prem agent strictly required. (My sandbox can't reach it — that's a
  sandbox restriction, not a firewall on your side.)

### Recommended path (decisive)
**Pull a copy — do NOT reroute the devices.** The devices' push to this server is
your *live* attendance (pay depends on it); rerouting them to a new endpoint is
high-risk and untestable from here. Instead, poll a read-only copy into the app
every few minutes — automatic, idempotent (no double entries), near-real-time.

Source, in order of preference for eTimeTrackLite:
1. **DB read** — poll `DeviceLogs` with a read-only SQL login (best if the DB is
   reachable externally or via a secure tunnel).
2. **AutoExport** — set the software to export new punches to a file/FTP on a
   schedule; the app ingests that.

eTimeTrackLite has no built-in REST API, so "API pull" most likely resolves to one
of those two. A real-time **transparent ADMS proxy** (repoint devices at our
endpoint, forward to eSSL) is possible but higher-risk — kept as a fallback.

### Still needed — two screenshots, no technical checks
1. The **login / home page** (confirms exact product + version).
2. The **Settings / Admin / Tools menu** (to spot AutoExport / Database / API /
   Integration options).

Mapping: you're flexible, so easiest is to set each device user's ID = the app's
`employee_id`; otherwise we keep a small map.

## What the existing system is

`http://203.163.246.91:86/iclock/Main.aspx` — the `/iclock/` path is the
**ZKTeco / eSSL "ADMS" push protocol** and `.aspx` on port 86 is a Windows-hosted
ASP.NET console. In India this is almost certainly an **eSSL** product (eSSL
rebrands ZKTeco). The fingerprint/face terminals push their logs to this box over
`/iclock/cdata`. It is firewalled to your network — not reachable (and not
loggable-into) from here — so the device/server side stays with you.

## What the app already has (nothing new is forked)

- `supabase/functions/ingest-punches` — accepts JSON punches
  (`{ events: [{ employee_id|staff_id, direction:"in"|"out", ts, method?, raw_ref? }] }`)
  with an `x-device-key` header, normalises them via the shared `punch-normalize`
  reducer into `attendance_sessions` (exactly what settlements read).
- `punch_events` has a `UNIQUE (device_id, ts, staff_id)` constraint →
  **idempotent**: the same physical punch lands once even on retries. This is the
  backbone of the "no data loss / no double entry" requirement.
- `biometric_devices` (hashed device keys) + a Hardware Management settings panel.

The gap: `ingest-punches` speaks **JSON**, not the raw `/iclock` wire format — so
a terminal cannot push to it directly. We bridge with a puller/agent (below).

## Architecture (reliable, incremental, automatic)

```
 eSSL/ZKTeco server ──(A API pull / B DB read)──▶ sync worker ──POST──▶ ingest-punches ──▶ attendance_sessions
        ▲                                          │  watermark cursor            │ UNIQUE(device_id,ts,staff_id)
        └ punches from terminals                   └ retry + alert on stale       └ dedup + reducer
```

- **Incremental watermark**: the worker stores the last synced punch id/timestamp
  (a small `biometric_sync_state` row) and only fetches newer rows each run → no
  full re-sync, no delay.
- **Idempotent write**: every fetched punch is POSTed to `ingest-punches`; the
  `punch_events` UNIQUE constraint drops duplicates, so overlap on the watermark
  boundary is harmless (no wrong/duplicate entries).
- **Automatic cadence**: a schedule (every 5–15 min) drives it — no manual step.
- **Monitoring**: alert if no punch has synced in N hours (catches a dead worker /
  offline device) so "no data loss" is observable, not assumed.
- **Mapping**: device **enrolment number → app `employee_id`**. If they already
  match, zero mapping; otherwise we add an `employee_id ↔ device_user_id` map.

### Where the worker runs depends on reachability (decides A vs on-prem)

- **If the eSSL server / its DB is reachable from the internet** (it's a public
  IP, so possibly yes) **and exposes an API** → a **scheduled Supabase edge
  function** does the pull. Cleanest; nothing on-prem.
- **If it's LAN-only or has no API** → a tiny **on-prem agent** (Windows service /
  scheduled task on the PC that runs the eSSL software) reads its DB/CSV export and
  POSTs to `ingest-punches`. Same idempotent endpoint, just pushed from inside the
  network.

## Path priority (as requested: API first, then DB/export)

1. **API pull** — if the eSSL/ZKTeco edition exposes REST/SOAP or a scheduled
   export API. Fastest to make reliable. *Need: the product name + confirmation it
   has an API, and an API key you generate.*
2. **DB / export sync** (fallback) — read the software's punch table directly.
   eSSL eTimeTrackLite → SQL Server table `DeviceLogs`/`Punchlogs`; other editions
   → MySQL `att_punches`/similar, or a scheduled CSV/Excel export. *Need: read
   access (a read-only DB user) or the export location.*

## What I need from you to build it (I won't handle secrets in chat)

1. **Product name + version** shown at the top of that `Main.aspx` page (eSSL
   eTimeTrackLite? ZKBioTime? Smart Office? other) — determines API vs DB schema.
2. **Reachability**: is `203.163.246.91:86` (or its database) reachable from
   outside your office, or only on the LAN? → picks cloud edge function vs on-prem
   agent.
3. **API?**: does the product have an API / scheduled-export option? (A link
   labelled "API", "Integration", "AutoExport", or "ADMS" on the page is a good
   sign.)
4. **Mapping**: do the terminals' enrolment IDs equal the app's `employee_id`?
5. Credentials (API key / read-only DB user) — you **configure** these in the
   worker's env / Supabase secrets; do not paste them here.

Once (1)–(4) are known, the first build is small: the watermark + idempotent
POST loop is generic; only the ~30-line source adapter (API client or DB query)
differs, and the ingest side already exists.
