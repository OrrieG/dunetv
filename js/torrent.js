/* WebTorrent engine wrapper. Runs the BitTorrent client inside the TV's browser
   over WebRTC data channels. Constraints to keep in mind while experimenting:
   - Browser peers can only reach other WebRTC-capable peers (web clients, or
     hybrid desktop clients like WebTorrent Desktop / libtorrent with WebRTC).
     That is a small subset of a torrent's swarm. wss:// trackers are the only
     trackers usable; udp:// and http:// announce URLs are ignored.
   - render-media streams via MSE, which works for MP4/WebM whose index (moov)
     is at the front. MKV or MP4 with moov at the end will not progressive-play.
   - A WebRTC bridge on your LAN (see README) can be added later to reach the
     whole swarm without a "streaming server" in the Stremio sense. */
var Torrent = (function () {
  var WSS_TRACKERS = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.webtorrent.dev',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.files.fm:7073/announce'
  ];
  var client = null, active = null, statsTimer = null, listeners = {};

  function emit(ev, data) { (listeners[ev] || []).forEach(function (f) { f(data); }); }
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }

  function ensureClient() {
    if (client) return client;
    if (typeof WebTorrent === 'undefined') throw new Error('WebTorrent bundle not loaded');
    if (!WebTorrent.WEBRTC_SUPPORT) throw new Error('No WebRTC in this engine');
    client = new WebTorrent({
      tracker: { rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } },
      maxConns: 30
    });
    client.on('error', function (e) { emit('error', e); });
    return client;
  }

  function isVideo(name) { return /\.(mp4|m4v|webm|mkv|mov|avi|ts)$/i.test(name); }
  function pickFile(t, fileIdx) {
    if (typeof fileIdx === 'number' && t.files[fileIdx]) return t.files[fileIdx];
    var vids = t.files.filter(function (f) { return isVideo(f.name); });
    vids.sort(function (a, b) { return b.length - a.length; });
    return vids[0] || t.files[0];
  }

  function stop() {
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    if (active && client) { try { client.remove(active.infoHash); } catch (e) {} }
    active = null;
  }

  /* stream: a Stremio stream object { infoHash, fileIdx, sources[], title } */
  function play(stream, videoEl) {
    stop();
    var c = ensureClient();
    var announce = WSS_TRACKERS.slice();
    (stream.sources || []).forEach(function (s) { if (/^tracker:wss?:\/\//.test(s)) announce.push(s.replace(/^tracker:/, '')); });
    var magnet = 'magnet:?xt=urn:btih:' + stream.infoHash + announce.map(function (t) { return '&tr=' + encodeURIComponent(t); }).join('');

    return new Promise(function (resolve, reject) {
      var started = Date.now();
      emit('status', 'Resolving peers for ' + stream.infoHash.slice(0, 8) + '…');
      c.add(magnet, { announce: announce }, function (t) {
        active = t;
        var file = pickFile(t, stream.fileIdx);
        if (!file) return reject(new Error('no file in torrent'));
        // Prioritise only the chosen file
        t.files.forEach(function (f) { if (f !== file) f.deselect(); });
        file.select();
        emit('status', 'Metadata in ' + Math.round((Date.now() - started) / 100) / 10 + 's · ' + file.name);
        var mp4Hint = /\.(mp4|m4v|webm)$/i.test(file.name);
        if (!mp4Hint) emit('warn', file.name.split('.').pop().toUpperCase() + ' container: progressive MSE playback usually fails in-browser');
        file.renderTo(videoEl, { autoplay: true, controls: false, muted: false }, function (err) {
          if (err) { emit('error', err); reject(err); } else resolve({ torrent: t, file: file });
        });
        statsTimer = setInterval(function () {
          emit('stats', { peers: t.numPeers, down: t.downloadSpeed, up: t.uploadSpeed, progress: t.progress, downloaded: t.downloaded, name: file.name, length: file.length });
        }, 1000);
      });
      c.on('error', reject);
    });
  }

  return { play: play, stop: stop, on: on, trackers: WSS_TRACKERS, client: function () { return client; } };
})();
