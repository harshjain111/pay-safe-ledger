# Device probe — Secureye S-FB5K

Run this on a PC **on the same network as the terminal**. It only reads; it
never enrols, deletes, or changes anything on the device.

```bash
node probe.cjs 192.168.1.201
```

Use the IP shown on the device under **Menu → Comm → Ethernet**. If the
terminal uses a non-standard port, pass it second: `node probe.cjs <ip> 4370`.

Nothing to install — it speaks the protocol over a plain TCP socket, so any
Node 18+ will run it.

## What the answer tells us

**It connects and prints device info.** The terminal speaks the standard
protocol, and an on-premise connector can manage users and fingerprint
templates on it. `FaceFunOn` and the face count say whether the face engine
is present and reachable.

**TCP connect fails.** Wrong IP, different subnet/VLAN, a firewall, or a
non-standard port. The script says which to check.

**Connects but the handshake is refused.** The device has a Comm Key set
(**Menu → Comm → Security → Comm Key**). Either clear it for the test or tell
me the value so the connector can authenticate.

## Why a probe first

The browser cannot open a raw TCP socket, and our cloud cannot reach a device
sitting behind the restaurant's NAT — so enrolment has to be driven by an
agent on your LAN. Everything else depends on that agent being able to talk to
this terminal, and this is the cheapest way to find out.
