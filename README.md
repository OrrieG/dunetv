# Dune TV — a self-built Stremio-addon player for VIDAA OS

An experiment: a VIDAA "app" (plain HTML/JS, no framework, no build step) that
speaks the Stremio addon protocol directly and runs a BitTorrent client
**inside the TV's browser engine** via WebTorrent/WebRTC. No Stremio account,
no Stremio server, no debrid.

```
probe/index.html   on-screen diagnostics: what does this TV's engine actually support?
app/index.html     the app: catalogs, search, detail, streams, player, addon manager
app/js/keys.js     remote keyCode → name
app/js/nav.js      D-pad spatial navigation (nearest focusable in a direction)
app/js/addons.js   Stremio addon protocol client (manifest/catalog/meta/stream/subtitles)
app/js/torrent.js  WebTorrent wrapper: magnet from infoHash + wss trackers, MSE render
app/js/player.js   <video> + OSD + transport keys
app/js/app.js      screens, routing, stream list sorting
```

## Step 0 — run the probe first

Host the folder (see Hosting) and open `probe/index.html` on the TV. It shows:
Chromium version, `Hisense_*` globals exposed to the page, MSE/EME codec
support (H.264, HEVC, VP9, AV1, AC-3…), Widevine, WebRTC + whether an ICE
candidate is actually produced, storage quota, CORS to Cinemeta, and a live
keyCode logger (press every remote key once). Results are saved to
`localStorage["vidaa-probe"]`; add `?report=http://<pc-ip>:8080/` to POST them
to a PC (`python3 -m http.server` won't accept POST — use `nc -l 8080` or a
tiny Flask/Express handler).

Two things the probe answers that decide the whole project:

* **Does WebRTC produce an ICE candidate?** If "ICE candidate: none", the
  engine has WebRTC APIs but no working transport; WebTorrent will never find
  peers and you need the LAN bridge (below).
* **Is `MediaSource.isTypeSupported('video/mp4; codecs="avc1.640028"')`
  true?** WebTorrent renders via MSE. If false, in-browser torrent playback is
  dead on this firmware and only direct-URL streams (`stream.url`) will work.

Run it both from the plain Browser *and* as an installed app if you manage
the launcher install — the `Hisense_*` surface differs between the two.

## Hosting

Any static host. For development, on a PC on the same LAN:

```
cd vidaa-tv-app
python3 -m http.server 8000
```

then on the TV open `http://<pc-ip>:8000/app/`. For something permanent push
the folder to GitHub Pages (HTTPS matters: `wss://` trackers and some addons
refuse mixed content from an `http://` page — if the TV browser blocks it,
serve over HTTPS with a self-signed cert or use Pages).

Getting it onto the TV as an icon is the same three routes as before:
bookmark / "Add to Home" (Cloud Link) in the TV browser, the `vidaahub.com`
DNS-spoof installer (`Hisense_installApp`), or Vidaa-Edge. The app itself
doesn't care which.

## Remote keys

| Key | Browse | Player |
|---|---|---|
| D-pad | move focus | ←/→ seek 10s/30s, ↑/↓ seek 5 min |
| OK | open / play | play-pause |
| Back | previous screen (exits app at root via `Hisense_Exit`) | stop |
| Yellow | Search | |
| Blue | Addons | |

## Addons

Defaults: Cinemeta (catalog + meta), Torrentio (streams), OpenSubtitles v3.
Add any addon by pasting its `manifest.json` URL in **Addons** (`stremio://`
prefixes are rewritten to `https://`). A configured Torrentio URL
(`https://torrentio.strem.fun/<config>/manifest.json`) works as-is, so you can
pre-filter providers/qualities on Torrentio's config page and paste the result.

Routing is by the manifest's `resources`/`types`/`idPrefixes`, exactly like
Stremio core; catalogs with required extras (genre/year) are skipped on the
home screen.

## The torrent engine — what to expect

WebTorrent in a browser only talks WebRTC, so it sees the **web-peer subset**
of a swarm: other browsers, WebTorrent Desktop, and hybrid clients. For a
popular release that's often a handful of peers; for anything obscure it can
be zero. The stream list sorts MP4/WebM first because `render-media` streams
via MSE, which needs the index (`moov`) near the start of an MP4; MKV (the
majority of Torrentio results) will *not* progressive-play in-browser, which
the UI flags with an orange tag.

Three ways to push past that, in increasing order of effort:

1. **Prefer MP4 sources.** YTS releases are MP4 and well seeded. A Torrentio
   config limited to YTS makes most results playable.
2. **Run a WebRTC-capable seeder/bridge on your LAN.** A desktop WebTorrent
   (`npx webtorrent-hybrid download <magnet>`) or a libtorrent build with
   WebTorrent support joins both the UDP/TCP swarm and the WebRTC swarm, so the
   TV gets the whole swarm's bandwidth through one LAN peer. Point the TV's
   client at your own tracker (`npx bittorrent-tracker --ws`) and add it to
   `WSS_TRACKERS` in `torrent.js`. This is not a "streaming server": nothing is
   transcoded or proxied, the TV still runs the client.
3. **Remux in-browser.** MKV → fragmented MP4 is feasible in JS (the same
   trick Stremio's own web player had to avoid). Heavy on a TV CPU; worth
   trying only after 1 and 2 are solid.

## Known gaps / next experiments

* No subtitle rendering yet (`Addons.subtitles()` works; wire SRT→VTT into a
  `<track>`).
* Series: episode list is capped at 60 and there's no season picker.
* `WebTorrent 1.9.7` is loaded from jsDelivr; vendor it locally once you know
  it runs on the TV (`app/vendor/webtorrent.min.js`).
* If the probe shows a `Hisense_*` function that isn't documented (e.g. an
  app-registry writer), that's the lead for a cleaner launcher install than
  the DNS spoof.
* Remote DevTools: try `http://<tv-ip>:9222` and `:9226` from Chrome on a PC.
  If a port is open you get a full console into the TV engine.

## Verified so far

Logic verified in a headless DOM with mocked addon responses: addon loading
and routing, catalog rows, D-pad navigation, search, detail → streams →
player → back, Yellow/Blue shortcuts, addon manager. Not yet verified on a
TV — that's what the probe page is for.
