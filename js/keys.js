/* Remote key normalisation. VIDAA follows the CE-HTML / HbbTV VK_* codes;
   extra codes cover LG (461), Samsung (10009) and desktop keys for testing. */
var Keys = (function () {
  var map = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'ok', 32: 'playpause',
    8: 'back', 27: 'back', 461: 'back', 10009: 'back', 166: 'back',
    415: 'play', 19: 'pause', 10252: 'playpause', 413: 'stop',
    417: 'ff', 412: 'rw', 425: 'ff', 424: 'rw',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info', 70: 'ff', 82: 'rw', 83: 'stop', 73: 'info'
  };
  return {
    name: function (e) { return map[e.keyCode] || null; },
    map: map
  };
})();
