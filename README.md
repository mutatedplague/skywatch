# SKYWATCH

A self-hosted radar console for the sky over your house. Point it at an
RTL-SDR receiver and every aircraft within range appears on a phosphor scope,
with a live contact list, proximity alerts, and a full track readout.

![The SKYWATCH console tracking traffic around a site near Denver](docs/console.jpg)

- **Runs off your own radio.** A bundled `dump1090-fa` container drives a USB
  RTL-SDR dongle. No account, no third party, no internet needed.
- **Or off a public feed.** adsb.lol, airplanes.live and OpenSky work with no
  hardware at all, and a built-in simulator runs the UI with no feed at all.
- **Tells you what is overhead.** Anything inside your alert volume turns amber
  on the scope, jumps to the top of the contact list, and can ring a tone.
- **One command to run.** `docker compose up` brings up the whole stack.

---

## Quick start

### With your RTL-SDR (Linux host, including a Raspberry Pi)

```bash
git clone https://github.com/YOUR-USERNAME/skywatch.git
cd skywatch
cp .env.example .env
# set HOME_LAT and HOME_LON to your rooftop position, then:
docker compose --profile sdr up -d --build
```

Open <http://localhost:3000>.

The `sdr` profile adds the `dump1090` service, which claims the dongle on
`/dev/bus/usb` and serves decoded traffic at
`http://localhost:8080/data/aircraft.json`. The decoder is
[flightaware/dump1090](https://github.com/flightaware/dump1090), compiled from
source when the image is built.

Before the first run, stop the kernel's DVB driver from grabbing the dongle:

```bash
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtl.conf
sudo rmmod dvb_usb_rtl28xxu 2>/dev/null || true
```

### Without an SDR

Pick a community feed instead — no hardware, no account:

```bash
cp .env.example .env
# in .env: ADSB_SOURCE=adsblol  (plus your HOME_LAT / HOME_LON)
docker compose up -d --build
```

Leave `HOME_LAT` and `HOME_LON` empty and SKYWATCH starts on simulated traffic
so you can see the console working before committing to a feed.

### Running on macOS

Docker Desktop cannot pass a USB device into a Linux container, so the bundled
`dump1090` service will not see your dongle on a Mac. Two ways round it:

1. **Run the decoder natively, the rest in Docker.** Build dump1090-fa on the
   Mac, run it with `--write-json` plus any static file server, and point
   SKYWATCH at it:

   ```bash
   # in .env
   ADSB_SOURCE=dump1090
   DUMP1090_URL=http://host.docker.internal:8080/data/aircraft.json
   ```

2. **Put the radio on a Raspberry Pi** running PiAware or dump1090-fa, and set
   `DUMP1090_URL=http://<pi-address>:8080/data/aircraft.json`. The Mac then runs
   only the two SKYWATCH containers.

---

## Reading the scope

| What you see | What it means |
| --- | --- |
| Blue-white flash | The sweep just painted that contact |
| Yellow-green trail | Phosphor persistence, fading until the next sweep |
| Amber symbol | Inside your alert volume — close and low |
| Red symbol | Squawking 7500, 7600 or 7700 |
| Square bracket | Flagged military in the receiver's database |
| Line off the nose | One minute of travel at the current ground speed |
| Dotted tail | Where the contact has been since it came into range |
| Dashed inner ring | The alert volume itself |

Click any contact on the scope or in the list to lock it; the bar along the
bottom then carries its full track. `Esc` clears the lock. **RANGE** zooms the
scope, **SYMBOLS** switches between aircraft silhouettes and plain radar blips,
and **tone** plays a short sound when a new contact enters the airspace.

---

## Configuration

Everything is set through environment variables, normally via `.env`. See
[`.env.example`](.env.example) for the annotated version.

| Variable | Default | What it does |
| --- | --- | --- |
| `HOME_LAT`, `HOME_LON` | *(none)* | Your position in decimal degrees. Without these, SKYWATCH runs simulated traffic. |
| `SITE_NAME` | `HOME` | Label shown on the console. |
| `ADSB_SOURCE` | `dump1090` | `dump1090`, `adsblol`, `airplaneslive`, `opensky` or `demo`. |
| `DUMP1090_URL` | `http://dump1090:8080/data/aircraft.json` | Where to fetch `aircraft.json`. |
| `RANGE_NM` | `100` | How far out to pull traffic. The scope zooms within this. |
| `ALERT_RADIUS_NM` | `3` | Contacts nearer than this may count as overhead. |
| `ALERT_ALTITUDE_FT` | `12000` | …and lower than this. Both must be true. |
| `STALE_SECONDS` | `75` | Drop a contact this long after its last report. |
| `POLL_MS` | per source | Override the poll interval. |
| `OPENSKY_CLIENT_ID` / `_SECRET` | *(none)* | OpenSky API credentials. |
| `FRONTEND_PORT` | `3000` | Console port. |
| `BACKEND_PORT` | `4000` | Receiver API port. |
| `NEXT_PUBLIC_API_URL` | *(none)* | Only needed behind a reverse proxy; otherwise the browser derives it. |

Radio-side settings — `DUMP1090_GAIN`, `DUMP1090_DEVICE`,
`DUMP1090_MAX_RANGE_NM`, `DUMP1090_VERSION`, `DUMP1090_EXTRA_ARGS` — are
described in `.env.example` and apply only to the bundled decoder.

### Data sources

| `ADSB_SOURCE` | Needs | Poll | Notes |
| --- | --- | --- | --- |
| `dump1090` | Your own receiver | 1s | Best coverage of your own sky, and the only one that keeps working offline. |
| `adsblol` | Nothing | 2s | [adsb.lol](https://adsb.lol) community network. |
| `airplaneslive` | Nothing | 2s | [airplanes.live](https://airplanes.live). Keep to one request per second. |
| `opensky` | Account for useful limits | 10s | [OpenSky Network](https://opensky-network.org). Anonymous access is heavily throttled. |
| `demo` | Nothing | 0.5s | Synthetic traffic for working on the UI. |

---

## Hardware notes

Any RTL2832U dongle decodes ADS-B, but the ones sold for the job (an
RTL-SDR Blog v3/v4, a FlightAware Pro Stick) include a 1090 MHz filter and a
low-noise amplifier, which is usually worth more than anything you can do in
software.

Range is almost entirely about the antenna and where it sits. ADS-B is
line-of-sight at 1090 MHz, so height beats gain: a cheap quarter-wave ground
plane in the attic will beat an expensive antenna indoors. Keep the coax short,
and if you can only fix one thing, raise the antenna.

`DUMP1090_GAIN=adaptive` lets dump1090 tune its own gain, which is a good
starting point. If you want to chase the last few miles, pin a value in dB and
compare message rates at `http://localhost:8080/data/stats.json`.

---

## How it works

```
RTL-SDR ──► dump1090-fa ──► aircraft.json ──► backend ──► WebSocket ──► console
 1090 MHz    decode          HTTP/1s          track +       ~1/s        canvas
                                              geometry                   scope
```

The **backend** (`backend/`, Node + TypeScript + Fastify) polls one source,
normalises every record into a single shape, computes range and bearing from
your site, keeps a position history per aircraft, ages out contacts that stop
reporting, and pushes the whole picture to every connected console over a
WebSocket. dump1090-fa, adsb.lol and airplanes.live all speak the same readsb
record format, so one normaliser covers all three; OpenSky gets its own adapter.

The **frontend** (`frontend/`, Next.js + React) draws the scope on a canvas at
display refresh rate while the data underneath updates about once a second. The
sweep, the phosphor decay and the lock reticle are animation; everything else
comes straight off the feed.

### API

The backend is useful on its own:

| Endpoint | Returns |
| --- | --- |
| `GET /api/health` | Liveness, source name, contact count |
| `GET /api/config` | Site position, range, alert volume |
| `GET /api/aircraft` | The current picture, same shape as a socket frame |
| `WS /ws` | A snapshot per poll |

```bash
curl -s localhost:4000/api/aircraft | jq '.aircraft[0]'
```

---

## Development

Requires Node 20+.

```bash
# receiver, on :4000
cd backend && npm install
HOME_LAT=39.7392 HOME_LON=-104.9903 ADSB_SOURCE=demo npm run dev

# console, on :3000
cd frontend && npm install && npm run dev
```

`ADSB_SOURCE=demo` generates plausible traffic — airliners transiting, light
aircraft manoeuvring, the occasional low pass and emergency squawk — so the UI
can be worked on without a radio or a network feed.

```bash
npm run typecheck   # both packages
npm run build       # both packages
```

Layout of the repository:

```
backend/src/sources/   one adapter per feed, all returning the same shape
backend/src/tracker.ts contact history, geometry and ageing
frontend/components/   RadarScope is the canvas; everything else is chrome
frontend/lib/          feed socket, formatters, icon mapping
dump1090/              builds flightaware/dump1090 and serves its JSON
```

---

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Especially useful: type-designator mappings for aircraft the icon table misses,
and adapters for receivers this does not speak to yet.

## Licence

SKYWATCH is MIT licensed — see [LICENSE](LICENSE).

Bundled and referenced third-party components carry their own terms; see
[NOTICE.md](NOTICE.md). In particular:

**Aircraft icons by ADS-B Radar for macOS — <https://adsb-radar.com> —
<https://apps.apple.com/app/id1538149835>**

dump1090-fa is GPL v2 and is fetched from
[flightaware/dump1090](https://github.com/flightaware/dump1090) at image build
time rather than redistributed here.
