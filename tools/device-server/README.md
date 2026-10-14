# Device-push server (for terminals that take an IP, not a domain)

The BioMax terminal only offers **Push Server IP** and **Push Server Port**, so it
cannot reach Vercel (Vercel routes by domain name). This runs the same handler,
`api/device-push.ts`, on a small cloud server with a fixed public IP. The
terminal then works from any network.

```
terminal ──HTTP POST──▶ <server IP>:8090 ──▶ api/device-push.ts ──▶ Supabase
```

## Local

```
npm run device:local                 # http://localhost:3000/AIData.aspx, reads .env.local
npm run device:punch -- 1 0930       # fake punch: Device User ID 1 at 09:30 today
```

## Cloud server, one time

1. **Rent a server.** Smallest Ubuntu 22.04/24.04 instance anywhere (DigitalOcean,
   Hetzner, AWS Lightsail, E2E…). Note its public IPv4 address. If the provider
   has a firewall panel, allow inbound TCP **8090** (and 22 for SSH).
2. **Build** on this PC:
   ```
   npm run device:server:build
   ```
   This fills `tools/device-server/dist/` with `device-server.mjs`, `setup.sh`
   and `device-push.service`.
3. **Copy and install** (replace `<ip>`):
   ```
   scp -r tools/device-server/dist root@<ip>:/root/device-push
   ssh root@<ip> "bash /root/device-push/setup.sh"
   ```
   It asks for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (same values as
   `.env.local`), stores them in `/etc/device-push.env` (root-only), starts the
   service, and prints the IP and port to enter on the terminal.
4. **Terminal:** Push Server IP = the server's IP, Push Server Port = `8090`,
   SSL off. Punch — then `ssh root@<ip> journalctl -u device-push -f` shows
   `token-pinned` once, then `"event":"punch"` per punch.

## Updating the code

```
npm run device:server:build
scp -r tools/device-server/dist root@<ip>:/root/device-push
ssh root@<ip> "bash /root/device-push/setup.sh"
```
Settings are kept; only the code is replaced and the service restarted.

## Notes

- The connection is plain HTTP: punch data (User ID, time) is not encrypted in
  transit. No biometric data is stored or logged. Only terminals registered in
  Settings → Hardware are accepted, and each one is pinned to its token on first
  contact.
- The service-role key lives only in `/etc/device-push.env` on the server.
  Keep SSH key-only and the server patched (`apt upgrade`).
- Log lines are the same as on Vercel; see `docs/device-push.md` →
  *When something goes wrong*.
