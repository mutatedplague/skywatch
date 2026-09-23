# Third-party notices

SKYWATCH itself is MIT licensed (see [LICENSE](LICENSE)). The following
bundled or referenced components carry their own terms.

## Aircraft icons

`frontend/public/icons/*.svg` — 37 aircraft silhouettes from the free icon set
published by **ADS-B Radar for macOS**.

> These aircraft SVG icons are free to use for personal and commercial
> projects. The only requirement: please provide a backlink to ADS-B Radar
> somewhere in your project, website, or documentation — or buy the App
> ADS-B Radar.

Attribution, as requested by the author:

**Icons by ADS-B Radar for macOS — <https://adsb-radar.com> —
<https://apps.apple.com/app/id1538149835>**

The backlink is also rendered in the running application, in the lower right
corner of the radar console.

Source: <https://adsb-radar.com/help/icons.html>

## dump1090-fa

The optional `dump1090` service builds
[flightaware/dump1090](https://github.com/flightaware/dump1090) from source at
image build time. dump1090-fa is licensed under the GNU GPL v2. No dump1090
source or binary is redistributed in this repository; the Dockerfile fetches it
from the upstream project.

## Aircraft data

Flight positions come from whichever source you configure. When using a
community network, please respect its terms:

- [adsb.lol](https://adsb.lol) — open data, ODbL
- [airplanes.live](https://airplanes.live) — free API, one request per second
- [OpenSky Network](https://opensky-network.org) — free for non-commercial use,
  requires an account for useful rate limits

## Typefaces

The console loads **Chakra Petch** and **Spline Sans Mono** from Google Fonts at
runtime. Both are licensed under the SIL Open Font License 1.1.
