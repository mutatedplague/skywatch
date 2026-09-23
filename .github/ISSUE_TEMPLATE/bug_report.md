---
name: Bug report
about: Something on the scope is wrong or the stack will not run
labels: bug
---

**What happened**

**What you expected instead**

**Setup**

- Source (`ADSB_SOURCE`):
- Receiver (dongle model, or the feed you are using):
- Host (Linux / Raspberry Pi / macOS, and Docker version):

**Logs**

```
docker compose logs backend | tail -50
```

**If a specific aircraft is drawn wrong**

Its ICAO hex and type designator, from:

```
curl -s localhost:4000/api/aircraft | jq '.aircraft[] | {hex, type, category, flight}'
```
