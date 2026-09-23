# Contributing to SKYWATCH

Thanks for taking the time. This is a small project, so the process is small
too.

## Getting set up

Node 20 or newer.

```bash
npm run install:all

# receiver on :4000 — demo traffic needs no radio and no network feed
cd backend && HOME_LAT=39.7392 HOME_LON=-104.9903 ADSB_SOURCE=demo npm run dev

# console on :3000
cd frontend && npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Reporting a bug

Include the `ADSB_SOURCE` you were using, what the receiver is (dongle model,
or the feed), and anything from `docker compose logs backend`. If a specific
aircraft is drawn wrong, its ICAO hex and type designator make it easy to
reproduce — `curl -s localhost:4000/api/aircraft | jq` will show you both.

## Things that are especially welcome

- **Aircraft type mappings.** `frontend/lib/aircraftIcons.ts` maps ICAO type
  designators onto the icon set. It covers common traffic; it will not know
  what is flying over you. Adding a row is a one-line change.
- **New feed adapters.** Each lives in `backend/src/sources/` and only has to
  return `RawAircraft[]`. If it speaks the readsb `aircraft.json` format, the
  existing normaliser already handles it.
- **Receiver support.** Anything that decodes ADS-B and can write JSON or
  answer over HTTP should be able to feed this.

## House style

- TypeScript throughout, `strict` on, no `any` that can be avoided.
- Comments explain *why*, not *what*. Most code should not need one.
- Colour on the scope means contact state: amber for the alert volume, red for
  an emergency squawk, phosphor for everything else. Please keep it that way —
  altitude and speed are already carried by position and by the data blocks.
- No new runtime dependencies without a reason that a paragraph can justify.

## Licence

Contributions are accepted under the MIT licence, matching the rest of the
project.
