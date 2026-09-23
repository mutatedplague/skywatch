# syntax=docker/dockerfile:1
#
# dump1090-fa, built from the FlightAware source:
# https://github.com/flightaware/dump1090
#
# The decoder has no HTTP server of its own, so this image pairs it with
# busybox httpd serving the JSON directory at the same path a SkyAware
# receiver uses: http://<host>:8080/data/aircraft.json

FROM debian:bookworm-slim AS build

ARG DUMP1090_VERSION=v11.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      git \
      libncurses-dev \
      librtlsdr-dev \
      libusb-1.0-0-dev \
      pkg-config \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${DUMP1090_VERSION}" \
      https://github.com/flightaware/dump1090.git /src

WORKDIR /src
RUN make \
      RTLSDR=yes \
      BLADERF=no \
      HACKRF=no \
      LIMESDR=no \
      SOAPYSDR=no \
      DUMP1090_VERSION="${DUMP1090_VERSION}"

FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      busybox \
      librtlsdr0 \
      libusb-1.0-0 \
      rtl-sdr \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/dump1090 /usr/local/bin/dump1090
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /var/www/data

# 8080 JSON over HTTP · 30003 SBS/BaseStation · 30005 Beast
EXPOSE 8080 30003 30005

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD busybox wget -q -O /dev/null http://127.0.0.1:8080/data/aircraft.json || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
