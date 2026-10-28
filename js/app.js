/* Screen router + UI. Screens: home, search, detail, player, settings. */
var App = (function () {
  var stack = [], current = null, toastTimer;
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2500); }
  function status(msg) { $('status').textContent = msg || ''; }

  function show(name, push) {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.add('hidden');
    var el = $('screen-' + name); el.classList.remove('hidden');
    if (push !== false && current) stack.push(current);
    current = name;
    Nav.setRoot(el);
    setTimeout(Nav.focusFirst, 30);
  }
  function back() {
    if (current === 'player') { Player.exit(); return; } // Player.exit -> exit callback -> leavePlayer()
    var prev = stack.pop();
    if (!prev) { if (typeof window.Hisense_Exit === 'function') window.Hisense_Exit(); else history.back(); return; }
    show(prev, false);
  }
  function leavePlayer() { var prev = stack.pop() || 'home'; show(prev, false); }

  /* ---------- Home ---------- */
  function renderHome() {
    var rows = $('rows'); rows.innerHTML = '';
    var cats = Addons.catalogs().slice(0, 6);
    if (!cats.length) { rows.appendChild(h('div', 'dim', 'No catalogs. Check Addons.')); return; }
    cats.forEach(function (c) {
      var row = h('div', 'row'); row.appendChild(h('h2', null, c.name));
      var items = h('div', 'row-items'); items.appendChild(h('div', 'dim', 'Loading…')); row.appendChild(items); rows.appendChild(row);
      Addons.catalog(c).then(function (metas) {
        items.innerHTML = '';
        metas.slice(0, 25).forEach(function (m) { items.appendChild(posterCard(m)); });
        if (!Nav.current()) Nav.focusFirst();
      }).catch(function (e) { items.innerHTML = ''; items.appendChild(h('div', 'dim', 'Failed: ' + e.message)); });
    });
  }
  function posterCard(m) {
    var p = h('div', 'focusable poster'); p.tabIndex = 0;
    if (m.poster) p.style.backgroundImage = 'url(' + m.poster + ')';
    p.appendChild(h('div', 'cap', m.name + (m.releaseInfo ? ' (' + m.releaseInfo + ')' : '')));
    p.onclick = function () { openDetail(m.type, m.id); };
    return p;
  }

  /* ---------- Search ---------- */
  function renderSearch() {
    var input = $('search-input'); input.value = '';
    $('search-results').innerHTML = '';
    input.onkeydown = function (e) {
      if (Keys.name(e) === 'ok' && input.value.trim()) {
        e.preventDefault(); input.blur();
        var res = $('search-results'); res.innerHTML = ''; res.appendChild(h('div', 'dim', 'Searching…'));
        Addons.search(input.value.trim()).then(function (metas) {
          res.innerHTML = '';
          if (!metas.length) res.appendChild(h('div', 'dim', 'Nothing found'));
          metas.slice(0, 40).forEach(function (m) { res.appendChild(posterCard(m)); });
          var first = res.querySelector('.focusable'); if (first) Nav.focus(first);
        });
      }
    };
  }

  /* ---------- Detail ---------- */
  var detail = { meta: null, videoId: null };
  function openDetail(type, id) {
    show('detail');
    $('detail-title').textContent = 'Loading…'; $('detail-meta').textContent = ''; $('detail-desc').textContent = '';
    $('detail-streams').innerHTML = ''; $('detail-episodes').innerHTML = ''; $('detail-episodes').classList.add('hidden');
    $('detail-bg').style.backgroundImage = '';
    Addons.meta(type, id).then(function (m) {
      detail.meta = m;
      $('detail-title').textContent = m.name;
      $('detail-meta').textContent = [m.releaseInfo || m.year, m.runtime, (m.genres || []).join(', '), m.imdbRating ? 'IMDb ' + m.imdbRating : ''].filter(Boolean).join(' · ');
      $('detail-desc').textContent = m.description || '';
      if (m.background) $('detail-bg').style.backgroundImage = 'url(' + m.background + ')';
      if (m.type === 'series' && m.videos && m.videos.length) {
        var eps = $('detail-episodes'); eps.classList.remove('hidden');
        var vids = m.videos.filter(function (v) { return v.season > 0; }).slice(0, 60);
        vids.forEach(function (v) {
          var b = h('div', 'focusable ep', 'S' + v.season + 'E' + v.episode); b.tabIndex = 0; b.title = v.title || '';
          b.onclick = function () { var a = eps.querySelector('.active'); if (a) a.classList.remove('active'); b.classList.add('active'); loadStreams(m.type, v.id, m.name + ' S' + v.season + 'E' + v.episode); };
          eps.appendChild(b);
        });
        if (vids[0]) { eps.firstChild.classList.add('active'); loadStreams(m.type, vids[0].id, m.name + ' S' + vids[0].season + 'E' + vids[0].episode); }
      } else {
        loadStreams(m.type, m.id, m.name);
      }
      Nav.focusFirst();
    }).catch(function (e) { $('detail-title').textContent = 'Error: ' + e.message; });
  }

  // Torrentio titles look like: "Movie.2024.1080p.WEB.x264\n👤 45 💾 2.1 GB ⚙️ YTS" — pull out what we need
  function describe(s) {
    var t = (s.title || s.name || '').replace(/\n/g, ' ');
    var seeds = (t.match(/👤\s*(\d+)/) || [])[1];
    var size = (t.match(/💾\s*([\d.]+\s*[GM]B)/) || [])[1];
    var fname = (s.behaviorHints && s.behaviorHints.filename) || t.split(' ')[0];
    var ext = (fname.match(/\.(mp4|m4v|webm|mkv|avi|ts|mov)$/i) || [, (t.match(/\b(mp4|mkv|webm|avi)\b/i) || [])[1] || '?'])[1];
    var res = (t.match(/\b(2160p|4k|1080p|720p|480p)\b/i) || [])[1] || '';
    return { seeds: +seeds || 0, size: size || '', ext: ext.toLowerCase(), res: res.toUpperCase(), label: t.split('👤')[0].trim().slice(0, 90) };
  }

  function loadStreams(type, videoId, label) {
    detail.videoId = videoId;
    var box = $('detail-streams'); box.innerHTML = ''; box.appendChild(h('div', 'dim', 'Fetching streams from addons…'));
    Addons.streams(type, videoId).then(function (streams) {
      box.innerHTML = '';
      if (!streams.length) { box.appendChild(h('div', 'dim', 'No streams returned')); return; }
      var items = streams.map(function (s) { return { s: s, d: describe(s) }; });
      // Browser-playable first: direct URLs, then MP4/WebM torrents by seeders, then the rest
      items.sort(function (a, b) {
        var pa = a.s.url ? 0 : (/mp4|m4v|webm/.test(a.d.ext) ? 1 : 2), pb = b.s.url ? 0 : (/mp4|m4v|webm/.test(b.d.ext) ? 1 : 2);
        return pa - pb || b.d.seeds - a.d.seeds;
      });
      items.slice(0, 30).forEach(function (it) {
        var el = h('div', 'focusable stream'); el.tabIndex = 0;
        var kind = it.s.url ? 'HTTP' : it.d.ext.toUpperCase();
        var tag = h('span', 'tag' + (kind === 'MKV' || kind === 'AVI' ? ' warn' : ''), kind); el.appendChild(tag);
        if (it.d.res) el.appendChild(h('span', 'tag', it.d.res));
        el.appendChild(h('span', 'name', it.d.label));
        el.appendChild(h('span', 'seeds', (it.d.seeds ? '👤 ' + it.d.seeds + ' ' : '') + it.d.size + ' · ' + (it.s._addon || '')));
        el.onclick = function () { show('player'); Player.play(it.s, label + ' — ' + it.d.label, leavePlayer); };
        box.appendChild(el);
      });
    }).catch(function (e) { box.innerHTML = ''; box.appendChild(h('div', 'dim', 'Error: ' + e.message)); });
  }

  /* ---------- Settings ---------- */
  function renderAddons() {
    $('settings-title').textContent = 'Addons';
    var body = $('settings-body'); body.innerHTML = '';
    Addons.list().forEach(function (a, i) {
      var row = h('div', 'focusable setting'); row.tabIndex = 0;
      row.appendChild(h('span', 'k', a.manifest ? a.manifest.name + ' v' + a.manifest.version : 'FAILED: ' + a.error));
      row.appendChild(h('span', 'v', a.url + '  (OK = remove)'));
      row.onclick = function () { var u = Addons.urls(); u.splice(i, 1); Addons.saveUrls(u); Addons.load().then(renderAddons); };
      body.appendChild(row);
    });
    var input = h('input', 'focusable'); input.type = 'text'; input.placeholder = 'Paste addon manifest URL, press OK'; input.style.cssText = 'width:100%;font-size:22px;padding:10px;background:#161b22;color:#fff;border:2px solid #30363d;border-radius:8px;margin:10px 0';
    input.onkeydown = function (e) { if (Keys.name(e) === 'ok' && input.value.trim()) { var u = Addons.urls(); u.push(input.value.trim().replace(/^stremio:\/\//, 'https://')); Addons.saveUrls(u); Addons.load().then(renderAddons); } };
    body.appendChild(input);
    var reset = h('div', 'focusable setting', 'Reset to defaults'); reset.tabIndex = 0; reset.onclick = function () { Addons.saveUrls(Addons.DEFAULTS); Addons.load().then(renderAddons); };
    body.appendChild(reset);
    setTimeout(Nav.focusFirst, 30);
  }
  function renderEngine() {
    $('settings-title').textContent = 'Engine';
    var body = $('settings-body'); body.innerHTML = '';
    var rows = [
      ['User agent', navigator.userAgent],
      ['WebRTC', String(!!(window.RTCPeerConnection || window.webkitRTCPeerConnection))],
      ['WebTorrent', typeof WebTorrent !== 'undefined' ? (WebTorrent.VERSION || 'loaded') + ' rtc=' + WebTorrent.WEBRTC_SUPPORT : 'NOT LOADED'],
      ['MSE', String(typeof MediaSource !== 'undefined')],
      ['H.264 / HEVC / VP9 (MSE)', typeof MediaSource !== 'undefined' ? [MediaSource.isTypeSupported('video/mp4; codecs="avc1.640028"'), MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L153.B0"'), MediaSource.isTypeSupported('video/webm; codecs="vp9"')].join(' / ') : '-'],
      ['Trackers', Torrent.trackers.join('  ')],
      ['Hisense_* globals', Object.keys(window).filter(function (k) { return /^Hisense_/.test(k); }).join(', ') || '(none — not running as installed app)'],
      ['Model / firmware', [safeCall('Hisense_GetModelName'), safeCall('Hisense_GetFirmWareVersion')].join(' / ')]
    ];
    rows.forEach(function (r) { var row = h('div', 'focusable setting'); row.tabIndex = 0; row.appendChild(h('span', 'k', r[0])); row.appendChild(h('span', 'v', r[1])); body.appendChild(row); });
    setTimeout(Nav.focusFirst, 30);
  }
  function safeCall(fn) { try { return typeof window[fn] === 'function' ? String(window[fn]()) : '-'; } catch (e) { return 'ERR'; } }

  /* ---------- Boot ---------- */
  function init() {
    Player.init();
    Nav.on('back', back);
    Nav.on('key', function (k, e) {
      if (current === 'player') return Player.key(k);
      if (k === 'yellow') { show('search'); renderSearch(); return true; }
      if (k === 'blue') { show('settings'); renderAddons(); return true; }
      return false;
    });
    var menu = document.querySelectorAll('.menu-item');
    for (var i = 0; i < menu.length; i++) menu[i].onclick = function () {
      var a = this.getAttribute('data-action');
      if (a === 'search') { show('search'); renderSearch(); }
      if (a === 'addons') { show('settings'); renderAddons(); }
      if (a === 'engine') { show('settings'); renderEngine(); }
    };
    show('home');
    status('Loading addons…');
    Addons.load().then(function (list) {
      var ok = list.filter(function (a) { return a.manifest; }).length;
      status(ok + '/' + list.length + ' addons');
      renderHome();
    });
    // Deep link support: index.html#detail/movie/tt0133093
    var m = location.hash.match(/^#detail\/(\w+)\/(.+)$/); if (m) openDetail(m[1], decodeURIComponent(m[2]));
  }

  document.addEventListener('DOMContentLoaded', init);
  // Offline shell cache; only on https (or localhost) because browsers refuse service workers elsewhere
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e.message); });
  }
  return { toast: toast, show: show, back: back, openDetail: openDetail };
})();
