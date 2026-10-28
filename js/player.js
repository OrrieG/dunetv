/* HTML5 player with a TV-style OSD. Two sources: a direct URL (stream.url)
   played by the TV's native decoder, or a torrent stream rendered by WebTorrent. */
var Player = (function () {
  var video, osd, osdTimer, onExit, title = '';
  function $(id) { return document.getElementById(id); }
  function fmt(s) { if (!isFinite(s)) return '0:00'; s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : Math.round(b / 1024) + ' KB/s'; }

  function init() {
    video = $('video'); osd = $('osd');
    video.addEventListener('timeupdate', function () {
      $('osd-time').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
      $('osd-prog').style.width = (video.duration ? video.currentTime / video.duration * 100 : 0) + '%';
    });
    video.addEventListener('waiting', function () { $('buffering').classList.remove('hidden'); });
    video.addEventListener('playing', function () { $('buffering').classList.add('hidden'); showOSD(); });
    video.addEventListener('error', function () { var e = video.error; App.toast('Video error ' + (e ? e.code : '') + ' ' + (e && e.message ? e.message : '')); });
    video.addEventListener('ended', function () { exit(); });
    Torrent.on('stats', function (s) {
      $('osd-torrent').textContent = s.peers + ' peers · ↓ ' + fmtBytes(s.down) + ' · ' + Math.round(s.progress * 100) + '%';
      $('buffering-detail').textContent = s.peers + ' peers, ' + fmtBytes(s.down) + ', ' + Math.round(s.downloaded / 1048576) + ' MB of ' + s.name;
    });
    Torrent.on('status', function (m) { $('buffering-detail').textContent = m; });
    Torrent.on('warn', function (m) { App.toast(m, 5000); });
    Torrent.on('error', function (e) { App.toast('Torrent: ' + (e.message || e), 5000); });
  }

  function showOSD() { osd.classList.remove('hide'); clearTimeout(osdTimer); osdTimer = setTimeout(function () { osd.classList.add('hide'); }, 4000); }

  function play(stream, label, exitCb) {
    onExit = exitCb; title = label;
    $('osd-title').textContent = label; $('osd-torrent').textContent = '';
    $('buffering').classList.remove('hidden'); $('buffering-detail').textContent = 'Starting…';
    video.removeAttribute('src'); video.load();
    if (stream.url) {
      video.src = stream.url; video.play();
    } else if (stream.infoHash) {
      try { Torrent.play(stream, video).catch(function (e) { App.toast('Cannot play: ' + e.message, 6000); }); }
      catch (e) { App.toast(e.message, 6000); }
    }
    showOSD();
  }

  function exit() {
    Torrent.stop();
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    if (onExit) onExit();
  }

  function key(k) {
    showOSD();
    if (k === 'back' || k === 'stop') { exit(); return true; }
    if (k === 'ok' || k === 'playpause') { video.paused ? video.play() : video.pause(); return true; }
    if (k === 'play') { video.play(); return true; }
    if (k === 'pause') { video.pause(); return true; }
    if (k === 'right' || k === 'ff') { video.currentTime += 30; return true; }
    if (k === 'left' || k === 'rw') { video.currentTime -= 10; return true; }
    if (k === 'up') { video.currentTime += 300; return true; }
    if (k === 'down') { video.currentTime -= 300; return true; }
    return true; // swallow everything else while playing
  }

  return { init: init, play: play, exit: exit, key: key };
})();
