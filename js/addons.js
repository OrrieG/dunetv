/* Stremio addon protocol client.
   Spec: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md
   An addon is a base URL serving /manifest.json plus resource endpoints:
     /catalog/{type}/{id}.json            /catalog/{type}/{id}/search={q}.json
     /meta/{type}/{id}.json               /stream/{type}/{id}.json
     /subtitles/{type}/{id}.json
   This client takes a list of addon URLs, loads manifests, and routes each
   request to every addon that declares support, merging the results. */
var Addons = (function () {
  var STORAGE = 'dunetv.addons';
  var DEFAULTS = [
    'https://v3-cinemeta.strem.io/manifest.json',
    'https://torrentio.strem.fun/manifest.json',
    'https://opensubtitles-v3.strem.io/manifest.json'
  ];
  var addons = []; // { url, base, manifest }

  function urls() { try { var s = JSON.parse(localStorage.getItem(STORAGE)); if (s && s.length) return s; } catch (e) {} return DEFAULTS.slice(); }
  function saveUrls(list) { localStorage.setItem(STORAGE, JSON.stringify(list)); }

  function fetchJSON(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout ' + url)); } }, timeoutMs || 15000);
      fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); })
        .then(function (j) { if (!done) { done = true; clearTimeout(t); resolve(j); } })
        .catch(function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  function load() {
    addons = [];
    return Promise.all(urls().map(function (u) {
      var base = u.replace(/\/manifest\.json$/, '');
      return fetchJSON(u).then(function (m) { addons.push({ url: u, base: base, manifest: m }); })
        .catch(function (e) { console.warn('addon failed', u, e.message); addons.push({ url: u, base: base, manifest: null, error: e.message }); });
    })).then(function () { return addons; });
  }

  // Does this manifest serve `resource` for `type` (and optionally id prefix)?
  function supports(m, resource, type, id) {
    if (!m) return false;
    var res = (m.resources || []).map(function (r) { return typeof r === 'string' ? { name: r, types: m.types, idPrefixes: m.idPrefixes } : r; });
    for (var i = 0; i < res.length; i++) {
      var r = res[i];
      if (r.name !== resource) continue;
      if (r.types && type && r.types.indexOf(type) < 0) continue;
      if (id && r.idPrefixes && !r.idPrefixes.some(function (p) { return id.indexOf(p) === 0; })) continue;
      return true;
    }
    return false;
  }

  function catalogs() {
    var out = [];
    addons.forEach(function (a) {
      if (!a.manifest) return;
      (a.manifest.catalogs || []).forEach(function (c) {
        // skip catalogs that require extra params (search-only, genre-required)
        var required = (c.extra || []).filter(function (e) { return e.isRequired; });
        if (required.length) return;
        out.push({ addon: a, type: c.type, id: c.id, name: (c.name || c.id) + ' · ' + c.type });
      });
    });
    return out;
  }

  function catalog(c) { return fetchJSON(c.addon.base + '/catalog/' + c.type + '/' + encodeURIComponent(c.id) + '.json').then(function (j) { return j.metas || []; }); }

  function search(q) {
    var reqs = [];
    addons.forEach(function (a) {
      if (!a.manifest) return;
      (a.manifest.catalogs || []).forEach(function (c) {
        var hasSearch = (c.extra || []).some(function (e) { return e.name === 'search'; }) || (c.extraSupported || []).indexOf('search') >= 0;
        if (!hasSearch) return;
        reqs.push(fetchJSON(a.base + '/catalog/' + c.type + '/' + encodeURIComponent(c.id) + '/search=' + encodeURIComponent(q) + '.json').then(function (j) { return j.metas || []; }).catch(function () { return []; }));
      });
    });
    return Promise.all(reqs).then(function (lists) {
      var seen = {}, out = [];
      lists.forEach(function (l) { l.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; out.push(m); } }); });
      return out;
    });
  }

  function meta(type, id) {
    var a = addons.filter(function (x) { return supports(x.manifest, 'meta', type, id); })[0];
    if (!a) return Promise.reject(new Error('no addon serves meta for ' + type + '/' + id));
    return fetchJSON(a.base + '/meta/' + type + '/' + encodeURIComponent(id) + '.json').then(function (j) { return j.meta; });
  }

  function streams(type, id) {
    var reqs = addons.filter(function (x) { return supports(x.manifest, 'stream', type, id); }).map(function (a) {
      return fetchJSON(a.base + '/stream/' + type + '/' + encodeURIComponent(id) + '.json', 25000)
        .then(function (j) { return (j.streams || []).map(function (s) { s._addon = a.manifest.name; return s; }); })
        .catch(function (e) { console.warn('stream fail', a.url, e.message); return []; });
    });
    return Promise.all(reqs).then(function (lists) { return [].concat.apply([], lists); });
  }

  function subtitles(type, id) {
    var reqs = addons.filter(function (x) { return supports(x.manifest, 'subtitles', type, id); }).map(function (a) {
      return fetchJSON(a.base + '/subtitles/' + type + '/' + encodeURIComponent(id) + '.json').then(function (j) { return j.subtitles || []; }).catch(function () { return []; });
    });
    return Promise.all(reqs).then(function (lists) { return [].concat.apply([], lists); });
  }

  return { load: load, list: function () { return addons; }, urls: urls, saveUrls: saveUrls, DEFAULTS: DEFAULTS,
           catalogs: catalogs, catalog: catalog, search: search, meta: meta, streams: streams, subtitles: subtitles };
})();
