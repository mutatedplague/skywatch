# Security policy

SKYWATCH is meant to run on your own network. The receiver has no
authentication: anyone who can reach port 4000 can read the picture and, unless
`ALLOW_SITE_EDIT=false`, move the site. Keep it behind your router or a reverse
proxy that asks for a login before exposing it to the internet.

## Supported versions

Only the `main` branch is supported. Fixes land there and are not backported.

## Reporting a vulnerability

Please do not open a public issue for anything that could be exploited.

Use GitHub's private reporting instead: **Security → Report a vulnerability**
on the repository page, which opens a draft advisory only the maintainer can
see. Include what you found, how to reproduce it, and what you think it lets an
attacker do.

You will get an acknowledgement within a week. If the report is confirmed, the
fix is pushed to `main` and the advisory is published with credit to you,
unless you would rather stay anonymous.

## What counts

Things that would be good to hear about:

- A way for someone on the network to run code on the receiver or the console.
- A way to read files from the receiver's host, or to write outside `STATE_DIR`.
- A feed or geocoder response that crashes the receiver or hangs the poll loop.
- Something in the console that leaks the site position to a third party
  beyond the terrain tiles and address lookup that the README already describes.

Things that are not security issues, though still worth an ordinary issue:

- The receiver being reachable without a password. That is by design; see above.
- Rate limits or bans from a public feed caused by your own configuration.
