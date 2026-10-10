/* Návštěvnost najemsradosti.cz bez cookies – nic se neukládá do prohlížeče, IP se neukládá.
   Data a přehled: webhunter-admin (src/stats.js), administrace /admin/ → Návštěvnost. */
(function () {
  try { if (navigator.webdriver || localStorage.getItem('nsr_nemerit') === '1') return; } catch (e) {}
  if (!/(^|\.)najemsradosti\.cz$/.test(location.hostname)) return;
  var E = 'https://webhunter-admin.webhunter.workers.dev/api/najemsradosti/hit', last = '', first = true;
  function send() {
    var p = location.pathname;
    if (p === last) return;
    last = p;
    var r = '', u = '';
    if (first) {
      r = document.referrer || '';
      try { if (r && new URL(r).hostname === location.hostname) r = ''; } catch (e) { r = ''; }
      try { u = new URLSearchParams(location.search).get('utm_source') || ''; } catch (e) {}
    }
    first = false;
    var d = JSON.stringify({ p: p, r: r, u: u, w: window.innerWidth || 0 });
    try { if (navigator.sendBeacon && navigator.sendBeacon(E, d)) return; } catch (e) {}
    try { fetch(E, { method: 'POST', body: d, keepalive: true, mode: 'no-cors' }); } catch (e) {}
  }
  // přechody mezi stránkami bez načtení (Next.js) – history API + záložní kontrola
  ['pushState', 'replaceState'].forEach(function (m) {
    var o = history[m];
    if (typeof o === 'function') history[m] = function () { var x = o.apply(this, arguments); setTimeout(send, 0); return x; };
  });
  window.addEventListener('popstate', function () { setTimeout(send, 0); });
  setInterval(send, 2000);
  send();
})();
