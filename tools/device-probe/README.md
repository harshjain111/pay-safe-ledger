# Device probe — Secureye S-FB5K

Run this on a PC **on the same network as the terminal**. It only reads; it
never enrols, deletes, or changes anything on the device.

```bash
node probe.cjs 192.168.1.201
node probe.cjs 192.168.1.201 4370 123456     # if a Comm Password is set
```

The three arguments are exactly the values on the device under **Menu → Comm**:
the IP from **Ethernet**, the **TCP Port** (default 4370), and the
**Comm Password** if one has been set.

Nothing to install — it speaks the protocol over a plain TCP socket, so any
Node 18+ will run it.

## What the answer tells us

**It connects and prints device info.** The terminal speaks the standard
protocol, and an on-premise connector can manage users and fingerprint
templates on it. `FaceFunOn` and the face count say whether the face engine
is present and reachable.

**TCP connect fails.** Wrong IP, different subnet/VLAN, a firewall, or a
non-standard port. The script says which to check.

**It asks for the Comm Password.** The device answered, but it is protected.
Read **Menu → Comm → Comm Password** and pass it as the third argument. The
script performs the real authentication handshake, so there is no need to
clear the password on the device.

## About the other Comm settings

**Event Transfer Mode** and **Host PC Port** let the terminal push punches to a
host as they happen, rather than being polled. Useful once the agent exists --
it makes attendance real-time instead of on a timer -- but it does not change
the architecture: there is no field for a public URL, so the target is still a
machine on your LAN, not our cloud.

**Device ID** matters when several terminals share a network; it is how they
are told apart on the wire. Worth checking each unit's Device ID against the
matching row in the app once the probe confirms which serial sits where.

## Why a probe first

The browser cannot open a raw TCP socket, and our cloud cannot reach a device
sitting behind the restaurant's NAT — so enrolment has to be driven by an
agent on your LAN. Everything else depends on that agent being able to talk to
this terminal, and this is the cheapest way to find out.
