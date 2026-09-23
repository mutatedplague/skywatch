#!/bin/sh
set -eu

JSON_DIR=/var/www/data
mkdir -p "$JSON_DIR"

# Serve the decoder's JSON output. dump1090-fa only writes files; the HTTP
# layer is ours, and it mirrors the SkyAware path so existing tools work.
busybox httpd -p 0.0.0.0:8080 -h /var/www

# v9+ can track gain on its own. Set DUMP1090_GAIN to a number in dB (or -10
# for the tuner's own AGC) to pin it instead.
if [ "${DUMP1090_GAIN:-adaptive}" = "adaptive" ]; then
  GAIN_ARGS="--adaptive-burst --adaptive-range"
else
  GAIN_ARGS="--gain ${DUMP1090_GAIN}"
fi

DEVICE_ARGS=""
if [ -n "${DUMP1090_DEVICE:-}" ]; then
  DEVICE_ARGS="--device ${DUMP1090_DEVICE}"
fi

LOCATION_ARGS=""
if [ -n "${HOME_LAT:-}" ] && [ -n "${HOME_LON:-}" ]; then
  LOCATION_ARGS="--lat ${HOME_LAT} --lon ${HOME_LON}"
fi

echo "dump1090-fa starting: device-type=${DUMP1090_DEVICE_TYPE:-rtlsdr} gain=${DUMP1090_GAIN:-adaptive}"

# shellcheck disable=SC2086
exec /usr/local/bin/dump1090 \
  --device-type "${DUMP1090_DEVICE_TYPE:-rtlsdr}" \
  $DEVICE_ARGS \
  $GAIN_ARGS \
  $LOCATION_ARGS \
  --max-range "${DUMP1090_MAX_RANGE_NM:-300}" \
  --write-json "$JSON_DIR" \
  --write-json-every 1 \
  --json-location-accuracy 1 \
  --net \
  --net-bind-address 0.0.0.0 \
  --net-ro-port 30002 \
  --net-sbs-port 30003 \
  --net-bo-port 30005 \
  --quiet \
  ${DUMP1090_EXTRA_ARGS:-}
