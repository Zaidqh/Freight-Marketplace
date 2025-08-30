/* assets/common.js — unified client helpers for Duff Bros Freight demo
   Supports: index.html, loads.html, bids.html, bookings.html, messages.html (+ navbar controls on admin.html)
   Requires: Bootstrap bundle (for Toast), modern Fetch (Chrome/Edge/Firefox/Safari). ASCII-only JS. */

(function () {
  'use strict';

  // ------------------------ Role Chooser ------------------------
  function bootRoleChooser() {
    var roleGate = qs('#roleGate');
    if (!roleGate) return;
    
    // Check if role gate has been completed
    if (localStorage.getItem('duff.roleGateDone') === '1') {
      roleGate.classList.add('d-none');
    }
    
    // Customer selection
    var chooseCustomer = qs('#chooseCustomer');
    if (chooseCustomer) {
      chooseCustomer.addEventListener('click', function() {
        localStorage.setItem('duff.role', 'customer');
        localStorage.setItem('duff.roleGateDone', '1');
        roleGate.classList.add('d-none');
      });
    }
    
    // Transporter selection
    var chooseTransporter = qs('#chooseTransporter');
    if (chooseTransporter) {
      chooseTransporter.addEventListener('click', function() {
        localStorage.setItem('duff.role', 'transporter');
        localStorage.setItem('duff.roleGateDone', '1');
        roleGate.classList.add('d-none');
      });
    }
    
    // Skip option
    var skipGate = qs('#skipGate');
    if (skipGate) {
      skipGate.addEventListener('click', function(e) {
        e.preventDefault();
        localStorage.setItem('duff.roleGateDone', '1');
        roleGate.classList.add('d-none');
      });
    }
  }
  
  // Expose reset function globally
  window.resetRoleGate = function() {
    localStorage.removeItem('duff.roleGateDone');
    var roleGate = qs('#roleGate');
    if (roleGate) roleGate.classList.remove('d-none');
  };

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

  // Resilient toast helper that never silently fails
  function toast(msg, type = 'info') {
    // Try to use existing toast container first
    var el = qs('#toast'), body = qs('#toastBody');
    
    if (el && body && window.bootstrap && bootstrap.Toast) {
      // Use Bootstrap toast
      body.textContent = msg;
      var t = new bootstrap.Toast(el);
      t.show();
      return;
    }
    
    // Fallback: inject a minimal toast if none exists
    var injectedToast = injectMinimalToast(msg, type);
    if (injectedToast) {
      // Auto-remove after 4 seconds
      setTimeout(function() {
        if (injectedToast.parentNode) {
          injectedToast.parentNode.removeChild(injectedToast);
        }
      }, 4000);
      return;
    }
    
    // Last resort: use alert() if injection is blocked
    alert(msg);
  }
  
  // Inject a minimal, dismissible toast element
  function injectMinimalToast(msg, type) {
    try {
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#333;color:white;padding:1rem;border-radius:4px;z-index:9999;max-width:300px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      toast.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <strong>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'} ${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
          <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:white;cursor:pointer;font-size:1.2rem;">×</button>
        </div>
        <div>${escapeHtml(msg)}</div>
      `;
      
      document.body.appendChild(toast);
      return toast;
    } catch (e) {
      return null;
    }
  }

  // ------------------------ Base URL persistence ------------------------
  var LS_BASE = 'duff.baseUrl';
  function getBase() {
    // Check for meta tag first
    var metaBase = qs('meta[name="api-base"]');
    if (metaBase && metaBase.content) {
      return metaBase.content;
    }
    
    // Check input field
    var input = qs('#baseUrl');
    var fromInput = input && input.value ? input.value : null;
    
    // Check localStorage
    var fromLs = localStorage.getItem(LS_BASE);
    
    // Return input value, localStorage value, or fallback to same-origin
    return fromInput || fromLs || window.location.origin;
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
    var opts = { method: method, headers: { 'Accept': 'application/json' }, credentials: 'include' };
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
      http('POST', '/seed', {}).then(function () {
        toast('Demo data seeded');
        refreshHomeShipments();
        refreshShipmentsList();
        refreshPublicFeed();
        refreshBookings();
      }).catch(function (e) { toast(e.message); });
    });

    // Auth mount: role selector + login/logout using httpOnly cookie sessions
    var mount = qs('#authMount');
    if (mount) {
      mount.innerHTML = (
        '<div class="input-group input-group-sm" style="width: 280px">' +
          '<label class="input-group-text" for="roleSelect">Role</label>' +
          '<select class="form-select" id="roleSelect">' +
            '<option value="">Guest</option>' +
            '<option value="shipper">Shipper</option>' +
            '<option value="transporter">Transporter</option>' +
            '<option value="admin">Admin</option>' +
          '</select>' +
          '<button class="btn btn-outline-secondary" id="btnLogin">Login</button>' +
          '<button class="btn btn-outline-secondary" id="btnLogout">Logout</button>' +
        '</div>'
      );
      var sel = qs('#roleSelect');
      var btnLogin = qs('#btnLogin');
      var btnLogout = qs('#btnLogout');
      if (btnLogin) btnLogin.addEventListener('click', function(){
        var role = sel && sel.value ? sel.value : '';
        if (!role) { toast('Select a role'); return; }
        http('POST', '/auth/demo-login', { role: role }).then(function(){
          toast('Logged in as ' + role);
        }).catch(function(e){ toast(e.message); });
      });
      if (btnLogout) btnLogout.addEventListener('click', function(){
        http('POST', '/auth/logout', {}).then(function(){
          toast('Logged out');
        }).catch(function(e){ toast(e.message); });
      });
    }
    // Shipments realtime via Socket.IO (if available)
    try {
      if (window.io) {
        var socket = window.io(getBase(), { withCredentials: true });
        socket.on('shipment:new', function(){ refreshPublicFeed(); refreshHomeShipments(); });
        socket.on('quote:new', function(){ /* optional */ });
        socket.on('booking:new', function(){ refreshBookings(); });
        socket.on('booking:update', function(){ refreshBookings(); });
      }
    } catch (e) {}
  }

  // Tokens panel removed: no longer used

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

  // ------------------------ Public Feed (feed.html) ------------------------
  function cardForFeedShipment(s) {
    var route = escapeHtml((s.pickup || '') + ' → ' + (s.dropoff || ''));
    var title = escapeHtml(s.title || 'Shipment');
    var service = escapeHtml(s.service || '—');
    var adr = s.adr ? '<span class="badge text-bg-danger ms-1">ADR</span>' : '';
    var href = 'bids.html?id=' + encodeURIComponent(s.id);
    return (
      '<li class="col-12 col-md-6 col-lg-4">' +
        '<div class="card h-100">' +
          '<div class="card-body d-flex flex-column">' +
            '<div class="small text-secondary">id: <span class="code">' + escapeHtml(s.id) + '</span></div>' +
            '<div class="fw-semibold">' + title + '</div>' +
            '<div class="text-secondary small mt-1">' + route + '</div>' +
            '<div class="small mt-1">Service: <span class="code">' + service + '</span>' + adr + '</div>' +
            '<div class="mt-2">' + makeStatusBadge(s.status) + '</div>' +
            '<a class="btn btn-primary mt-auto" href="' + href + '"><i class="bi bi-send"></i> Send quote</a>' +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  function readFeedFilters() {
    var f = {
      pickupContains: (qs('#f_pickup') && qs('#f_pickup').value || '').trim(),
      dropoffContains: (qs('#f_dropoff') && qs('#f_dropoff').value || '').trim(),
      service: (qs('#f_service') && qs('#f_service').value || '').trim(),
      adr: !!(qs('#f_adr') && qs('#f_adr').checked),
      earliestDate: (qs('#f_earliest') && qs('#f_earliest').value || '').trim(),
    };
    return f;
  }

  function buildQuery(params) {
    var pairs = [];
    for (var k in params) {
      if (params[k] == null || params[k] === '' || (k === 'adr' && params[k] === false)) continue;
      pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
    return pairs.length ? ('?' + pairs.join('&')) : '';
  }

  function refreshPublicFeed() {
    var ul = qs('#feedList');
    if (!ul) return;
    var f = readFeedFilters();
    var q = buildQuery({ status: 'OPEN', pickupContains: f.pickupContains, dropoffContains: f.dropoffContains, service: f.service, adr: f.adr, earliestDate: f.earliestDate });
    http('GET', '/api/shipments' + q).then(function(res){
      var list = (res && res.data) ? res.data : [];
      if (!list.length) {
        ul.innerHTML = '<li class="col-12"><div class="card"><div class="card-body small text-secondary">No open requests match your filters.</div></div></li>';
        return;
      }
      ul.innerHTML = list.map(cardForFeedShipment).join('');
    }).catch(function(){});
  }

  function bootFeed() {
    var ul = qs('#feedList'); if (!ul) return;
    refreshPublicFeed();
    // Filters
    ['#f_pickup','#f_dropoff','#f_service','#f_adr','#f_earliest'].forEach(function(sel){
      var el = qs(sel); if (!el) return;
      el.addEventListener('change', refreshPublicFeed);
      el.addEventListener('input', function(){ if (sel === '#f_pickup' || sel === '#f_dropoff') refreshPublicFeed(); });
    });
    // Realtime via SSE first
    try {
      var ev = new EventSource(getBase().replace(/^http/, 'http') + '/events/shipments', { withCredentials: true });
      ev.addEventListener('shipment:new', function(){ refreshPublicFeed(); });
    } catch (e) {}
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
      if (qs('#sel_service')) payload.service = qs('#sel_service').value || '';
      if (qs('#cb_adr')) payload.adr = !!qs('#cb_adr').checked;
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
      var price = (Number(q.pricePennies || 0) / 100);
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
                '<div class="h5 m-0">' + (new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(price)) + '</div>' +
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
    var shipmentId = query.id || query.shipmentId || '';

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
          toast('Quote accepted — proceed to payment');
          try {
            if (res && res.data && res.data.id) {
              var bookingId = res.data.id;
              window.location.href = 'payment.html?bookingId=' + encodeURIComponent(bookingId);
              return;
            }
          } catch (e) {}
          loadAll();
        }).catch(function (e2) { toast(e2.message); });
    });

    loadAll();
  }

  // ------------------------ Bookings (bookings.html) ------------------------
  function bookingCard(b) {
    var route = (b.shipment ? (b.shipment.pickup + ' → ' + b.shipment.dropoff) : '');
    var trans = (b.quote && b.quote.companyName) ? b.quote.companyName : '—';
    var price = (b.quote && b.quote.pricePennies != null) ? (b.quote.pricePennies / 100) : 0;
    var idShort = String(b.id || '').slice(0, 10) + '…';
    var threadLink = b.threadId ? ('<a class="small" href="messages.html?threadId=' + encodeURIComponent(b.threadId) + '">Open chat</a>') : '';
    var paidBadge = b.paid ? '<span class="badge text-bg-success ms-2">PAID</span>' : '<span class="badge text-bg-warning ms-2">UNPAID</span>';
    var payCta = (!b.paid && b.id) ? ('<a class="btn btn-sm btn-primary" href="payment.html?bookingId=' + encodeURIComponent(b.id) + '"><i class="bi bi-credit-card"></i> Pay now</a>') : '';
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
                '<div class="small text-secondary">Transporter: ' + escapeHtml(trans) + ' · ' + (new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(price)) + '</div>' +
              '</div>' +
              '<div>' + makeStatusBadge(b.status) + '</div>' +
            '</div>' +
            '<div class="mt-3 d-flex flex-wrap gap-2">' + btns + paidBadge + '</div>' +
            (threadLink ? ('<div class="mt-3">' + threadLink + '</div>') : '') +
            (payCta ? ('<div class="mt-2">' + payCta + '</div>') : '') +
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
      if (status === 'CANCELLED' && !confirm('Are you sure you want to cancel this booking?')) return;
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
    try { box.scrollTop = box.scrollHeight; } catch (e) {}
  }

  function bootMessages() {
    var threadsList = qs('#threadsList');
    var box = qs('#messagesBox');
    var input = qs('#messageInput');
    var form = qs('#messageForm');
    var currentNameEl = qs('#currentThreadName');
    var currentMetaEl = qs('#currentThreadMeta');
    if (!threadsList || !box || !input || !form) return;

    // Demo threads (persistable)
    var demoThreads = [
      { id: 't1', name: 'ACME Electronics', last: 'Need ETA update', meta: 'Shipment #1 • London → Paris' },
      { id: 't2', name: 'EuroFresh Foods', last: 'Temp control confirmed', meta: 'Reefer • Amsterdam → Berlin' },
      { id: 't3', name: 'BuildCo Ltd', last: 'Pickup window 9–11am', meta: 'Machinery • Manchester → Leeds' }
    ];

    var storageKeyMsgs = 'duff.messages.threads';
    var storageKeyCur = 'duff.messages.current';

    function loadAllThreads() {
      try {
        var raw = localStorage.getItem(storageKeyMsgs);
        if (!raw) {
          // seed with demo content
          var seed = {
            t1: [
              { who: 'them', text: 'Hi, can you share ETA for delivery?', when: now() },
              { who: 'me', text: 'ETA 14:30 local. Traffic clear.', when: now() }
            ],
            t2: [
              { who: 'them', text: 'Please confirm reefer at 4°C.', when: now() },
              { who: 'me', text: 'Confirmed: 4°C set and monitored.', when: now() }
            ],
            t3: [
              { who: 'them', text: 'Loader available 9–11am. OK?', when: now() },
              { who: 'me', text: 'Works. Driver will be on site 9:15.', when: now() }
            ]
          };
          localStorage.setItem(storageKeyMsgs, JSON.stringify(seed));
          return seed;
        }
        return JSON.parse(raw);
      } catch (e) { return {}; }
    }

    function now() {
      var d = new Date();
      return d.toISOString().replace('T', ' ').replace('Z', '');
    }

    var messagesByThread = loadAllThreads();
    var currentId = localStorage.getItem(storageKeyCur) || 't1';

    function renderThreads() {
      threadsList.innerHTML = demoThreads.map(function (t) {
        var active = (t.id === currentId) ? ' active' : '';
        return (
          '<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-start thread' + active + '" data-id="' + t.id + '">' +
            '<div class="me-auto">' +
              '<div class="fw-semibold">' + escapeHtml(t.name) + '</div>' +
              '<div class="small text-secondary">' + escapeHtml(t.last) + '</div>' +
            '</div>' +
            '<span class="badge rounded-pill text-bg-secondary">' + (messagesByThread[t.id] ? messagesByThread[t.id].length : 0) + '</span>' +
          '</button>'
        );
      }).join('');
    }

    function renderCurrent() {
      var meta = demoThreads.find(function(t){ return t.id === currentId; });
      currentNameEl.innerHTML = '<i class="bi bi-chat-dots me-2"></i>' + (meta ? escapeHtml(meta.name) : 'Conversation');
      currentMetaEl.textContent = meta ? meta.meta : '';
      var list = messagesByThread[currentId] || [];
      box.innerHTML = list.map(function (m) {
        var cls = (String(m.who) === 'me') ? 'me' : 'them';
        return (
          '<div class="d-flex flex-column ' + (cls === 'me' ? 'align-items-end' : '') + '">' +
            '<div class="msg-bubble ' + cls + '">' + escapeHtml(m.text || '') + '</div>' +
            '<div class="msg-meta">' + escapeHtml(m.when || '') + '</div>' +
          '</div>'
        );
      }).join('');
      try { box.scrollTop = box.scrollHeight; } catch (e) {}
    }

    threadsList.addEventListener('click', function (ev) {
      var t = ev.target.closest('.thread');
      if (!t) return;
      currentId = t.getAttribute('data-id');
      localStorage.setItem(storageKeyCur, currentId);
      renderThreads();
      renderCurrent();
    });

    var refreshBtn = qs('#refreshThreads');
    if (refreshBtn) refreshBtn.addEventListener('click', function(){ renderThreads(); renderCurrent(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var txt = (input.value || '').trim();
      if (!txt) return;
      var arr = messagesByThread[currentId] || (messagesByThread[currentId] = []);
      arr.push({ who: 'me', text: txt, when: now() });
      localStorage.setItem(storageKeyMsgs, JSON.stringify(messagesByThread));
      input.value = '';
      renderCurrent();
    });

    // initial render
    renderThreads();
    renderCurrent();
  }

  // ------------------------ Filters save/load (marketplace & bids) ------------------------
  var LS_FILTERS_MARKET = 'duff.filters.market';
  var LS_FILTERS_BIDS = 'duff.filters.bids';
  function saveFiltersTo(storageKey, fields) {
    try { localStorage.setItem(storageKey, JSON.stringify(fields)); } catch (e) {}
  }
  function loadFiltersFrom(storageKey) {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) { return {}; }
  }
  function bindFilterPersistence(storageKey, fieldIds) {
    var saved = loadFiltersFrom(storageKey);
    fieldIds.forEach(function(id){
      var el = qs('#' + id); if (!el) return;
      if (saved[id] != null) {
        if (el.type === 'checkbox') el.checked = !!saved[id];
        else el.value = saved[id];
      }
      el.addEventListener('change', function(){
        var snap = {};
        fieldIds.forEach(function(fid){
          var fel = qs('#' + fid); if (!fel) return;
          snap[fid] = (fel.type === 'checkbox') ? fel.checked : fel.value;
        });
        saveFiltersTo(storageKey, snap);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    if (qs('body.marketplace-page')) {
      bindFilterPersistence(LS_FILTERS_MARKET, ['f_pickup','f_dropoff','f_pickupDate','f_deliveryDate','f_loadType','f_cargoType','f_service','f_budget','f_weight','f_volume','f_crossBorder','f_adr','f_refrigerated','f_loading','f_unloading','f_packaging','f_urgent','f_flexible','f_weekend']);
    }
    if (qs('body.bids-page')) {
      bindFilterPersistence(LS_FILTERS_BIDS, ['f_pickup','f_dropoff','f_pickupDate','f_deliveryDate','f_loadType','f_service','f_budget','f_weight','f_volume','f_crossBorder','f_adr','f_refrigerated','f_loading','f_unloading','f_packaging','f_urgent','f_flexible','f_weekend']);
    }
  });

  // ------------------------ Page bootstraps ------------------------
  function boot() {
    // universal
    bootNavbar();
    bootRoleChooser(); // Add this line to call the new function

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
 