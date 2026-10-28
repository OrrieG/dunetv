/* Minimal spatial navigation for D-pad remotes.
   Any element with class "focusable" inside the active screen is a candidate.
   Moves to the geometrically nearest element in the pressed direction. */
var Nav = (function () {
  var current = null, root = document, handlers = {};

  function candidates() {
    var all = root.querySelectorAll('.focusable');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetParent === null) continue; // hidden
      out.push(el);
    }
    return out;
  }

  function rect(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }

  function pick(dir) {
    if (!current) { var c = candidates(); return c[0] || null; }
    var from = rect(current), best = null, bestScore = Infinity;
    candidates().forEach(function (el) {
      if (el === current) return;
      var to = rect(el), dx = to.x - from.x, dy = to.y - from.y, primary, secondary;
      if (dir === 'left')  { if (to.r > from.l + 2) return; primary = -dx; secondary = Math.abs(dy); }
      if (dir === 'right') { if (to.l < from.r - 2) return; primary = dx;  secondary = Math.abs(dy); }
      if (dir === 'up')    { if (to.b > from.t + 2) return; primary = -dy; secondary = Math.abs(dx); }
      if (dir === 'down')  { if (to.t < from.b - 2) return; primary = dy;  secondary = Math.abs(dx); }
      if (primary < 0) return;
      // Heavily weight the off-axis distance so rows/columns stay stable
      var score = primary + secondary * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function focus(el) {
    if (!el) return;
    if (current) current.classList.remove('focus');
    current = el; el.classList.add('focus');
    if (el.tagName === 'INPUT') el.focus(); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    scrollIntoView(el);
    if (handlers.focus) handlers.focus(el);
  }

  // Scroll the nearest overflow container so the element is visible (TV browsers lack smooth scrollIntoView options)
  function scrollIntoView(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      var cs = getComputedStyle(p);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'hidden') {
        var pr = p.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (er.right > pr.right) p.scrollLeft += er.right - pr.right + 40;
        if (er.left < pr.left) p.scrollLeft -= pr.left - er.left + 40;
        if (er.bottom > pr.bottom) p.scrollTop += er.bottom - pr.bottom + 40;
        if (er.top < pr.top) p.scrollTop -= pr.top - er.top + 40;
      }
      p = p.parentElement;
    }
  }

  function setRoot(el) { root = el || document; if (current && !root.contains(current)) { current.classList.remove('focus'); current = null; } }
  function focusFirst() { var c = candidates(); focus(c[0] || null); }

  document.addEventListener('keydown', function (e) {
    var k = Keys.name(e);
    if (!k) return;
    if (handlers.key && handlers.key(k, e) === true) { e.preventDefault(); return; }
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') {
      if (current && current.tagName === 'INPUT' && (k === 'left' || k === 'right')) return; // caret movement
      var next = pick(k); if (next) focus(next); e.preventDefault();
    } else if (k === 'ok') {
      if (current) { current.click(); e.preventDefault(); }
    } else if (k === 'back') {
      if (handlers.back) { handlers.back(); e.preventDefault(); }
    }
  });

  return { focus: focus, focusFirst: focusFirst, setRoot: setRoot, on: function (ev, fn) { handlers[ev] = fn; }, current: function () { return current; } };
})();
