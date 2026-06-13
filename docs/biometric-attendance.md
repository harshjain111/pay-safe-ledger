# Biometric / Face Attendance

Lets fingerprint and face-recognition devices (or an on-prem agent) punch
attendance that flows into the **same** pipeline as the in-app check-in widget —
and therefore into settlements — with no forked attendance logic.

## Architecture

```
device / agent ──POST──▶ ingest-punches ──▶ punch_events (idempotent inbox)
                                │
                                ▼  reducePunches() pairs in/out
                          attendance_sessions  ◀── also written by the in-app widget
                                │
                                ▼
                          settlements (read work_date, worked_minutes, status)
```

`attendance_sessions` is the single source of truth. A device punch becomes the
exact same row shape an app check-in produces (`status='completed'`,
`worked_minutes` set), so settlements pick it up automatically. The only
difference is `attendance_sessions.source` (`app` | `biometric` | `face` |
`manual`).

## Data model

| Table | Purpose |
| --- | --- |
| `biometric_devices` | Registered hardware: `label`, `outlet_id` (branch), `type` (`fingerprint`/`face`), `serial`, `status`, `last_seen_at`, `api_key_hash`, `api_key_prefix`, `is_active`. |
| `biometric_enrolments` | Which staff are enrolled: `staff_id`, `device_id` (NULL = global), `kind`, `template_ref` / `face_vector_ref`, `status` (`pending`/`enrolled`/`failed`), `enrolled_at`. |
| `punch_events` | Idempotent raw inbox: `staff_id`, `device_id`, `ts`, `direction`, `method`, `raw_ref`, `outlet_id`, `geo`, `session_id`. UNIQUE `(device_id, ts, staff_id)`. |

"Branch" maps to the existing **`outlets`** table.

## Ingestion API

```
POST {SUPABASE_URL}/functions/v1/ingest-punches
Headers:
  apikey: <project anon key>        # routes through the gateway (verify_jwt = false)
  x-device-key: <device API key>    # provisioned in Settings → Hardware
  content-type: application/json
```

Body:

```jsonc
{
  "events": [
    {
      "staff_id": "<uuid>",        // OR "employee_id": "EMP001"
      "direction": "in",            // "in" | "out"
      "ts": "2026-06-13T09:01:00+05:30",
      "method": "biometric",        // optional; defaults to the device type
      "raw_ref": "device-evt-123",  // optional; the device's own id (audit)
      "work_date": "2026-06-13",    // optional; defaults to the IST date of ts
      "geo": { "lat": 0, "lng": 0 } // optional
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "device_id": "…",
  "received": 1,
  "accepted": 1,
  "deduped": 0,
  "sessions_opened": 1,
  "sessions_closed": 0,
  "skipped": [],
  "errors": []
}
```

### Idempotency & pairing

- The exact same physical punch (`device_id`, `ts`, `staff_id`) is inserted into
  `punch_events` once — a retry returns it under `deduped`.
- `reducePunches` (`supabase/functions/_shared/punch-normalize.ts`, unit-tested
  in `src/lib/punch-normalize.test.ts`) pairs an `in` with the next `out` into a
  completed session, ignores a duplicate `in` while already checked in, and
  ignores an `out` with no open session. An `in` + `out` in one request pairs
  within that request.

### Device authentication

A device's API key is generated in **Settings → Hardware** (or regenerated). The
plaintext is shown **once**; only its SHA-256 hash is stored
(`biometric_devices.api_key_hash`). `ingest-punches` hashes the incoming
`x-device-key` and looks up the device. `rotate-device-key` (owner/admin,
JWT-gated) issues keys.

## Enrolment

**Settings → Hardware** manages devices. **People → Biometric Enrolment**
(`/biometric-enrolment`, owner/admin) lists attendance-tracked staff and their
enrolment status, with an Enrol / Re-enrol / Remove action. The dashboard
**Pending Biometrics** KPI counts un-enrolled staff and links here.

## Face provider (phase 2)

Face matching sits behind `FaceProvider` (`src/lib/face/`), selected via
`VITE_FACE_PROVIDER` (default `stub`). To onboard a vendor: implement
`FaceProvider`, add a `case` in `src/lib/face/index.ts`, set the env var. No call
sites change.

### Data retention

- We store **only a vector reference** (`biometric_enrolments.face_vector_ref`) —
  a vendor face id or stored-vector handle — **never a raw image or embedding**.
- Capture frames handed to `enrol()` / `match()` are transient: the provider
  processes them and they are discarded. Nothing writes images to our DB or
  storage. (Contrast: the in-app selfie check-in stores photos in the private
  `attendance-photos` bucket; biometric/face device punches store none —
  `check_in_photo_url` is the sentinel `'biometric'`.)
- Removing an enrolment deletes its `face_vector_ref`. Deleting a staff member
  cascades and removes their enrolments and punch events.
