/* assets/common.js — unified client helpers for Duff Bros Freight demo
   Supports: index.html, loads.html, bids.html, bookings.html, messages.html (+ navbar controls on admin.html)
   Requires: Bootstrap bundle (for Toast), modern Fetch (Chrome/Edge/Firefox/Safari). ASCII-only JS. */

(function () {
  'use strict';

  // ------------------------ Utilities ------------------------
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m];
    });
  }

  function parseQuery() {
    var out = {};
    var q = window.location.search || '';
    if (q.indexOf('?') === 0) q = q.slice(1);
    if (!q) return out;
    q.split('&').forEach(function (kv) {
      var p = kv.split('=');
      var k = decodeURIComponent(p[0] || '');
      var v = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
      if (k) out[k] = v;
    });
    return out;
  }

  function toast(msg) {
    var el = qs('#toast'), body = qs('#toastBody');
    if (!el || !body || !window.bootstrap || !bootstrap.Toast) { alert(msg); return; }
    body.textContent = msg;
    var t = new bootstrap.Toast(el);
    t.show();
  }

  // ------------------------ Base URL persistence ------------------------
  var LS_BASE = 'duff.baseUrl';
  function getBase() {
    var input = qs('#baseUrl');
    var fromInput = input && input.value ? input.value : null;
    var fromLs = localStorage.getItem(LS_BASE);
    return fromInput || fromLs || 'http://localhost:3000';
  }
  function setBase(newVal) {
    try { localStorage.setItem(LS_BASE, newVal); } catch (e) {}
    var input = qs('#baseUrl');
    if (input) input.value = newVal;
    var statusBase = qs('#statusBase');
    if (statusBase) statusBase.textContent = newVal;
  }

  function http(method, path, body, headers) {
    var url = getBase() + path;
    var opts = { method: method, headers: { 'Accept': 'application/json' } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (headers) {
      for (var k in headers) { opts.headers[k] = headers[k]; }
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error(method + ' ' + path + ' -> ' + r.status);
      return r.json();
    });
  }

  // ------------------------ Navbar: bind base/health/seed ------------------------
  function bootNavbar() {
    // Base URL wire-up + persistence
    var input = qs('#baseUrl');
    var initial = localStorage.getItem(LS_BASE) || (input ? input.value : '') || 'http://localhost:3000';
    setBase(initial);
    if (input) {
      input.addEventListener('change', function () { setBase(input.value || 'http://localhost:3000'); });
      input.addEventListener('blur', function () { setBase(input.value || 'http://localhost:3000'); });
    }

    var h = qs('#btnHealth');
    if (h) h.addEventListener('click', function () {
      http('GET', '/health').then(function (res) {
        toast('Health OK • ' + (res.time || ''));
      }).catch(function (e) { toast(e.message); });
    });

    var seed = qs('#btnSeed');
    if (seed) seed.addEventListener('click', function () {
      http('POST', '/_seed/demo', {}).then(function () {
        toast('Demo data seeded');
        // kick any page-specific refreshers
        refreshHomeShipments();
        refreshShipmentsList();
        refreshBookings();
      }).catch(function (e) { toast(e.message); });
    });
  }

  // ------------------------ Token save/clear (index) ------------------------
  function bootTokensPanel() {
    var ship = qs('#tok_ship'), trans = qs('#tok_trans'), admin = qs('#tok_admin');
    var save = qs('#btnSaveTokens'), clear = qs('#btnClearTokens');

    function loadTokens() {
      try {
        if (ship) ship.value = localStorage.getItem('duff.tok_ship') || '';
        if (trans) trans.value = localStorage.getItem('duff.tok_trans') || '';
        if (admin) admin.value = localStorage.getItem('duff.tok_admin') || '';
      } catch (e) {}
    }
    function saveTokens() {
      try {
        if (ship) localStorage.setItem('duff.tok_ship', ship.value || '');
        if (trans) localStorage.setItem('duff.tok_trans', trans.value || '');
        if (admin) localStorage.setItem('duff.tok_admin', admin.value || '');
      } catch (e) {}
      toast('Tokens saved');
    }
    function clearTokens() {
      try {
        localStorage.removeItem('duff.tok_ship');
        localStorage.removeItem('duff.tok_trans');
        localStorage.removeItem('duff.tok_admin');
      } catch (e) {}
      loadTokens();
      toast('Tokens cleared');
    }

    if (save) save.addEventListener('click', saveTokens);
    if (clear) clear.addEventListener('click', clearTokens);
    if (ship || trans || admin) loadTokens();
  }

  // ------------------------ Home (index.html): Open shipments ------------------------
  function makeStatusBadge(status) {
    var s = String(status || '').toUpperCase();
    var cls = 'secondary';
    if (s === 'OPEN') cls = 'success';
    else if (s === 'BOOKED') cls = 'primary';
    else if (s === 'DELIVERED') cls = 'success';
    else if (s === 'CANCELLED') cls = 'danger';
    return '<span class="badge text-bg-' + cls + '">' + escapeHtml(s) + '</span>';
  }

  function cardForShipment(s) {
    var route = escapeHtml((s.pickup || '') + ' → ' + (s.dropoff || ''));
    var title = escapeHtml(s.title || 'Shipment');
    var href = 'bids.html?id=' + encodeURIComponent(s.id);
    return (
      '<li class="col-12 col-md-6 col-lg-4">' +
        '<div class="card h-100">' +
          '<div class="card-body d-flex flex-column">' +
            '<div class="small text-secondary">id: <span class="code">' + escapeHtml(s.id) + '</span></div>' +
            '<div class="fw-semibold">' + title + '</div>' +
            '<div class="text-secondary small mt-1">' + route + '</div>' +
            '<div class="mt-2">' + makeStatusBadge(s.status) + '</div>' +
            '<a class="btn btn-outline-primary mt-auto" href="' + href + '">View &amp; quote</a>' +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  function refreshHomeShipments() {
    var ul = qs('#homeShipments');
    if (!ul) return;
    http('GET', '/api/shipments?status=OPEN').then(function (res) {
      var list = (res && res.data) ? res.data : [];
      var top = list.slice(0, 6);
      if (!top.length) {
        ul.innerHTML = '<li class="col-12"><div class="card"><div class="card-body small text-secondary">No open shipments yet. Post one on the Loads page.</div></div></li>';
        return;
      }
      ul.innerHTML = top.map(cardForShipment).join('');
    }).catch(function () {
      // leave placeholders
    });
  }

  // ------------------------ Loads (loads.html) ------------------------
  function refreshShipmentsList() {
    var ul = qs('#shipmentsList');
    if (!ul) return;
    http('GET', '/api/shipments').then(function (res) {
      var list = (res && res.data) ? res.data : [];
      if (!list.length) {
        ul.innerHTML = '<li class="col-12"><div class="card"><div class="card-body small text-secondary">No shipments yet. Use the form to post one.</div></div></li>';
        return;
      }
      ul.innerHTML = list.map(cardForShipment).join('');
    }).catch(function () {});
  }

  function bootLoads() {
    var form = qs('#newShipmentForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = v; });
      payload.crossBorder = !!qs('#cb_cross') && qs('#cb_cross').checked;
      if (payload.weightKg) payload.weightKg = Number(payload.weightKg);
      if (payload.volumeM3) payload.volumeM3 = Number(payload.volumeM3);

      http('POST', '/api/shipments', payload).then(function () {
        toast('Shipment posted');
        form.reset();
        refreshShipmentsList();
        refreshHomeShipments();
      }).catch(function (e2) { toast(e2.message); });
    });

    // initial list
    refreshShipmentsList();
  }

  // ------------------------ Bids (bids.html) ------------------------
  function renderShipmentHeader(container, s) {
    if (!container) return;
    var route = escapeHtml((s.pickup || '') + ' → ' + (s.dropoff || ''));
    var html =
      '<div class="d-flex justify-content-between align-items-start flex-wrap gap-2">' +
        '<div>' +
          '<div class="small text-secondary">shipment <span class="code">' + escapeHtml(s.id) + '</span></div>' +
          '<div class="h5 fw-bold mb-0">' + escapeHtml(s.title || 'Shipment') + '</div>' +
          '<div class="text-secondary small mt-1">' + route + '</div>' +
        '</div>' +
        '<div class="text-end">' + makeStatusBadge(s.status) + '</div>' +
      '</div>';
    container.innerHTML = html;
  }

  function renderQuotesList(ul, quotes) {
    if (!ul) return;
    if (!quotes || !quotes.length) {
      ul.innerHTML = '<li class="card"><div class="card-body small text-secondary">No quotes yet. Transporters can submit a quote using the form.</div></li>';
      return;
    }
    ul.innerHTML = quotes.map(function (q) {
      var price = (Number(q.pricePennies || 0) / 100).toFixed(2);
      var badge = (q.status === 'ACCEPTED') ? 'success' : (q.status === 'REJECTED') ? 'secondary' : 'primary';
      var actions = (q.status === 'ACTIVE')
        ? '<button class="btn btn-sm btn-success act-accept" data-quote="' + escapeHtml(q.id) + '">Accept</button>'
        : '<button class="btn btn-sm btn-outline-secondary" disabled>Locked</button>';
      return (
        '<li class="card" id="q-' + escapeHtml(q.id) + '">' +
          '<div class="card-body">' +
            '<div class="d-flex justify-content-between align-items-start">' +
              '<div>' +
                '<div class="fw-semibold">' + escapeHtml(q.companyName || 'Transporter') + '</div>' +
                '<div class="small text-secondary">' + escapeHtml(q.contactEmail || '') + '</div>' +
              '</div>' +
              '<div class="text-end">' +
                '<div class="h5 m-0">£' + price + '</div>' +
                '<div class="small text-secondary">ETA: ' + (q.etaDays != null ? String(q.etaDays) + 'd' : '—') + '</div>' +
              '</div>' +
            '</div>' +
            (q.message ? ('<div class="mt-2">' + escapeHtml(q.message) + '</div>') : '') +
            '<div class="d-flex justify-content-between align-items-center mt-3">' +
              '<span class="badge text-bg-' + badge + '">' + escapeHtml(q.status) + '</span>' +
              '<div>' + actions + '</div>' +
            '</div>' +
          '</div>' +
        '</li>'
      );
    }).join('');
  }

  function bootBids() {
    var info = qs('#shipmentInfo');
    var ul = qs('#quotesList');
    var form = qs('#quoteForm');
    if (!info || !ul || !form) return;

    var query = parseQuery();
    var shipmentId = query.id || '';

    function loadAll() {
      if (!shipmentId) { ul.innerHTML = '<li class="card"><div class="card-body small text-secondary">Open this page with <code>?id=SHIPMENT_ID</code>.</div></li>'; return; }
      http('GET', '/api/shipments/' + encodeURIComponent(shipmentId)).then(function (res) {
        var s = res.data && res.data.shipment ? res.data.shipment : null;
        var qs2 = res.data && res.data.quotes ? res.data.quotes : [];
        if (!s) { info.innerHTML = '<div class="small text-danger">Shipment not found.</div>'; return; }
        renderShipmentHeader(info, s);
        renderQuotesList(ul, qs2);
      }).catch(function (e) { toast(e.message); });
    }

    // Submit a quote
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!shipmentId) { toast('No shipment id'); return; }
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = v; });
      if (payload.price) payload.price = Number(payload.price);
      if (payload.etaDays) payload.etaDays = Number(payload.etaDays);
      http('POST', '/api/shipments/' + encodeURIComponent(shipmentId) + '/quotes', payload).then(function () {
        toast('Quote submitted');
        form.reset();
        loadAll();
      }).catch(function (e2) { toast(e2.message); });
    });

    // Accept a quote (event delegation)
    ul.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      if (!t || !t.classList) return;
      if (!t.classList.contains('act-accept')) return;
      var quoteId = t.getAttribute('data-quote');
      if (!quoteId) return;
      http('POST', '/api/shipments/' + encodeURIComponent(shipmentId) + '/quotes/' + encodeURIComponent(quoteId) + '/accept', {})
        .then(function (res) {
          toast('Quote accepted — booking created');
          loadAll();
          // Optional: hint to visit bookings
          try {
            if (res && res.data && res.data.booking && res.data.booking.id) {
              var b = res.data.booking;
              console.log('Booking created:', b.id, 'thread:', res.data.threadId);
            }
          } catch (e) {}
        }).catch(function (e2) { toast(e2.message); });
    });

    loadAll();
  }

  // ------------------------ Bookings (bookings.html) ------------------------
  function bookingCard(b) {
    var route = (b.shipment ? (b.shipment.pickup + ' → ' + b.shipment.dropoff) : '');
    var trans = (b.quote && b.quote.companyName) ? b.quote.companyName : '—';
    var price = (b.quote && b.quote.pricePennies != null) ? (b.quote.pricePennies / 100).toFixed(2) : '0.00';
    var idShort = String(b.id || '').slice(0, 10) + '…';
    var threadLink = b.threadId ? ('<a class="small" href="messages.html?threadId=' + encodeURIComponent(b.threadId) + '">Open chat</a>') : '';
    // status buttons
    var statuses = ['BOOKED', 'ENROUTE', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
    var btns = statuses.map(function (s) {
      var cls = 'outline-secondary';
      if (s === 'DELIVERED') cls = 'success';
      else if (s === 'CANCELLED') cls = 'danger';
      else if (s === 'BOOKED') cls = 'primary';
      return '<button class="btn btn-sm btn-' + cls + ' act-status" data-id="' + escapeHtml(b.id) + '" data-status="' + s + '">' + s + '</button>';
    }).join(' ');

    return (
      '<li class="col-12 col-lg-6">' +
        '<div class="card h-100">' +
          '<div class="card-body d-flex flex-column">' +
            '<div class="d-flex justify-content-between align-items-start flex-wrap gap-2">' +
              '<div>' +
                '<div class="small text-secondary">booking <span class="code">' + escapeHtml(idShort) + '</span></div>' +
                '<div class="fw-semibold">' + escapeHtml(route) + '</div>' +
                '<div class="small text-secondary">Transporter: ' + escapeHtml(trans) + ' · £' + price + '</div>' +
              '</div>' +
              '<div>' + makeStatusBadge(b.status) + '</div>' +
            '</div>' +
            '<div class="mt-3 d-flex flex-wrap gap-2">' + btns + '</div>' +
            (threadLink ? ('<div class="mt-3">' + threadLink + '</div>') : '') +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  function refreshBookings() {
    var ul = qs('#bookingsList');
    if (!ul) return;
    http('GET', '/api/bookings').then(function (res) {
      var list = (res && res.data) ? res.data : [];
      if (!list.length) {
        ul.innerHTML = '<li class="col-12"><div class="card"><div class="card-body small text-secondary">No bookings yet. Accept a quote to create one.</div></div></li>';
        return;
      }
      ul.innerHTML = list.map(bookingCard).join('');
    }).catch(function () {});
  }

  function bootBookings() {
    var ul = qs('#bookingsList');
    if (!ul) return;
    refreshBookings();
    ul.addEventListener('click', function (ev) {
      var t = ev.target || ev.srcElement;
      if (!t || !t.classList || !t.classList.contains('act-status')) return;
      var id = t.getAttribute('data-id');
      var status = t.getAttribute('data-status');
      http('POST', '/api/bookings/' + encodeURIComponent(id) + '/status', { status: status }).then(function () {
        toast('Status → ' + status);
        refreshBookings();
      }).catch(function (e) { toast(e.message); });
    });
  }

  // ------------------------ Messages (messages.html) ------------------------
  function renderMessages(box, list) {
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<div class="msg-empty small">No messages yet.</div>';
      return;
    }
    box.innerHTML = list.map(function (m) {
      var who = escapeHtml(m.senderName || m.senderRole || 'user');
      var when = escapeHtml((m.createdAt || '').replace('T', ' ').replace('Z', ''));
      var cls = (String(m.senderRole || '').toLowerCase() === 'shipper' || String(m.senderRole || '').toLowerCase() === 'user') ? 'me' : 'them';
      return (
        '<div class="d-flex flex-column ' + (cls === 'me' ? 'align-items-end' : '') + '">' +
          '<div class="msg-bubble ' + cls + '">' + escapeHtml(m.text || '') + '</div>' +
          '<div class="msg-meta">' + when + ' · ' + who + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function bootMessages() {
    var box = qs('#messagesBox');
    if (!box) return;
    var query = parseQuery();
    var threadId = query.threadId || '';

    // Only load when threadId is provided; otherwise allow page’s local echo to run
    if (!threadId) return;

    http('GET', '/api/messages?threadId=' + encodeURIComponent(threadId) + '&limit=200').then(function (res) {
      var list = (res && res.data) ? res.data : [];
      renderMessages(box, list);
    }).catch(function (e) { console.log(e); });

    // Optional: light polling (comment out if not wanted)
    var pollMs = 5000, handle = setInterval(function () {
      http('GET', '/api/messages?threadId=' + encodeURIComponent(threadId) + '&limit=200').then(function (res) {
        var list = (res && res.data) ? res.data : [];
        renderMessages(box, list);
      }).catch(function () {});
    }, pollMs);
    // stop polling on unload
    window.addEventListener('beforeunload', function(){ try { clearInterval(handle); } catch(e){} });
  }

  // ------------------------ Page bootstraps ------------------------
  function boot() {
    // universal
    bootNavbar();
    bootTokensPanel();

    // per-page
    refreshHomeShipments();   // if present
    bootLoads();
    bootBids();
    bootBookings();
    bootMessages();

    // footer year (if exists)
    var y = qs('#year');
    if (y) y.textContent = String((new Date()).getFullYear());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
 