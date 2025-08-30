// server.js
// Duff Bros Freight — demo API (in-memory)
// Run: node server.js  (defaults to http://localhost:3000)

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = (() => { try { return require('pino-http'); } catch(e){ return null; } })();
const http = require('http');
const stripeLib = (() => { try { return require('stripe'); } catch(e){ return null; } })();
const STRIPE_SECRET = process.env.STRIPE_SECRET || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = (stripeLib && STRIPE_SECRET) ? stripeLib(STRIPE_SECRET) : null;
let io = null;

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// Middleware (order matters: Stripe webhook must receive raw body)
// -------------------------------------------------------------
app.use(cors({ origin: true, credentials: true }));
if (pinoHttp) {
  app.use(pinoHttp({
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      res.setHeader('x-request-id', id);
      return id;
    }
  }));
}
app.use(cookieParser());

// Allow simple preflight for admin DELETE etc.
app.options('*', cors());

// -------------------------------------------------------------
// In-memory "database"
// -------------------------------------------------------------
const DB = {
  users: [],
  shipments: [],
  quotes: [],
  bookings: [],
  messages: [],
  dmThreads: [],
  dmMessages: [],
  flags: [],      // flagged shipments
  logs: [],       // audit log entries
  counters: {
    user: 1, load: 1, quote: 1, booking: 1, thread: 1, msg: 1, flag: 1, log: 1,
  },
  tokens: {
    shipper: 'shipper-demo-token',
    transporter: 'transporter-demo-token',
    admin: 'admin-demo-token',
  },
};

function nowISO() { return new Date().toISOString(); }
function pad(n) { return String(n).padStart(4, '0'); }
function genId(prefix) {
  if (!DB.counters[prefix]) DB.counters[prefix] = 1;
  const id = `${prefix}-${pad(DB.counters[prefix]++)}`;
  return id;
}

function log(actor, type, subject, detail) {
  const entry = {
    id: genId('log'),
    ts: nowISO(),
    actor: actor || 'system',
    type: type || 'info',
    subject: subject || '-',
    detail: detail || '',
  };
  DB.logs.unshift(entry);
  // cap log size
  if (DB.logs.length > 1000) DB.logs.length = 1000;
  return entry;
}

// -------------------------------------------------------------
// Realtime: Socket.IO (if available) + SSE fallback for shipments
// -------------------------------------------------------------
try {
  const { Server } = require('socket.io');
  io = new Server(server, { cors: { origin: true, credentials: true } });
  io.on('connection', (socket) => {
    try {
      const cookie = socket.handshake.headers.cookie || '';
      const raw = cookie.split('fm_session=')[1];
      if (raw) {
        const json = decodeURIComponent(raw.split(';')[0]);
        const sess = JSON.parse(json);
        if (sess && sess.userId) {
          socket.join(`user:${sess.userId}`);
        }
      }
    } catch (e) {}
    socket.join('shipments');
  });
} catch (e) {
  io = null;
}

const sseClients = new Set();
function sseBroadcast(event, data) {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => { try { res.write(payload); } catch (e) {} });
}
function emitPublic(event, data) {
  if (io) { try { io.to('shipments').emit(event, data); } catch (e) {} }
  sseBroadcast(event, data);
}
function emitToUsers(userIds, event, data) {
  if (!io || !Array.isArray(userIds) || !userIds.length) return;
  try { io.to(userIds.map(id => `user:${id}`)).emit(event, data); } catch (e) {}
}
app.get('/events/shipments', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  sseClients.add(res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

// -------------------------------------------------------------
// Seed data
// -------------------------------------------------------------
function clearAll() {
  DB.users = [];
  DB.shipments = [];
  DB.quotes = [];
  DB.bookings = [];
  DB.messages = [];
  DB.flags = [];
  DB.logs = [];
  DB.counters = { user: 1, load: 1, quote: 1, booking: 1, thread: 1, msg: 1, flag: 1, log: 1 };
}

function seed() {
  clearAll();

  // Users
  const admin = {
    id: genId('user'), name: 'Admin', email: 'admin@duffbros.local',
    role: 'admin', verified: true, banned: false, createdAt: nowISO(),
  };
  const shipper = {
    id: genId('user'), name: 'Acme Shipper', email: 'shipper@acme.local',
    role: 'shipper', verified: true, banned: false, createdAt: nowISO(),
  };
  const t1 = {
    id: genId('user'), name: 'Duff Logistics Ltd', email: 'ops@dufflogistics.local',
    role: 'transporter', verified: true, banned: false, insurance: 'CMR (2026)', createdAt: nowISO(),
  };
  const t2 = {
    id: genId('user'), name: 'Trans-Euro Freight', email: 'ops@transeuro.local',
    role: 'transporter', verified: false, banned: false, insurance: null, createdAt: nowISO(), // pending KYB
  };
  const t3 = {
    id: genId('user'), name: 'Fast Movers UK', email: 'ops@fastmovers.local',
    role: 'transporter', verified: true, banned: false, insurance: 'Goods-in-Transit (2025)', createdAt: nowISO(),
  };

  DB.users.push(admin, shipper, t1, t2, t3);

  // Shipments (OPEN / BOOKED / DELIVERED / CANCELLED)
  const s1 = {
    id: genId('load'),
    title: 'Household move — boxes & furniture',
    pickup: 'London, UK',
    dropoff: 'Berlin, DE',
    readyDate: nowISO().slice(0, 10),
    weightKg: 800, volumeM3: 6.0, crossBorder: true,
    service: 'removals', adr: false,
    notes: 'Tail-lift preferred. Fragile glassware.',
    status: 'OPEN', hidden: false, ownerId: shipper.id,
    createdAt: nowISO(),
  };
  const s2 = {
    id: genId('load'),
    title: 'Retail pallets (non-perishable)',
    pickup: 'Manchester, UK',
    dropoff: 'Paris, FR',
    readyDate: nowISO().slice(0, 10),
    weightKg: 1200, volumeM3: 10.5, crossBorder: true,
    service: 'general', adr: false,
    notes: 'Standard service ok.',
    status: 'BOOKED', hidden: false, ownerId: shipper.id,
    createdAt: nowISO(),
  };
  const s3 = {
    id: genId('load'),
    title: 'Chilled goods — reefer',
    pickup: 'Bristol, UK',
    dropoff: 'Vienna, AT',
    readyDate: nowISO().slice(0, 10),
    weightKg: 1000, volumeM3: 9.2, crossBorder: true,
    service: 'reefer', adr: false,
    notes: 'Keep at 4°C.',
    status: 'DELIVERED', hidden: false, ownerId: shipper.id,
    createdAt: nowISO(),
  };
  const s4 = {
    id: genId('load'),
    title: 'Structural steel — flatbed',
    pickup: 'Leeds, UK',
    dropoff: 'Prague, CZ',
    readyDate: nowISO().slice(0, 10),
    weightKg: 1500, volumeM3: 5.5, crossBorder: true,
    service: 'flatbed', adr: true,
    notes: 'Strapping required.',
    status: 'OPEN', hidden: false, ownerId: shipper.id,
    createdAt: nowISO(),
  };
  const s5 = {
    id: genId('load'),
    title: 'Boxed consumer goods',
    pickup: 'Birmingham, UK',
    dropoff: 'Lyon, FR',
    readyDate: nowISO().slice(0, 10),
    weightKg: 900, volumeM3: 7.0, crossBorder: true,
    service: 'general', adr: false,
    notes: 'Standard EU documentation.',
    status: 'OPEN', hidden: false, ownerId: shipper.id,
    createdAt: nowISO(),
  };
  DB.shipments.push(s1, s2, s3, s4, s5);

  // Quotes
  const q1 = {
    id: genId('quote'),
    shipmentId: s1.id,
    companyName: t1.name,
    contactEmail: t1.email,
    price: 1450, etaDays: 2,
    message: 'Two-man team, tail-lift, customs included',
    status: 'ACTIVE',
    createdAt: nowISO(),
    transporterUserId: t1.id,
  };
  const q2 = {
    id: genId('quote'),
    shipmentId: s1.id,
    companyName: t3.name,
    contactEmail: t3.email,
    price: 1520, etaDays: 3,
    message: 'Standard service, customs on request',
    status: 'ACTIVE',
    createdAt: nowISO(),
    transporterUserId: t3.id,
  };
  DB.quotes.push(q1, q2);

  // Accept one quote for s2 to create a booking
  const q3 = {
    id: genId('quote'),
    shipmentId: s2.id,
    companyName: t1.name,
    contactEmail: t1.email,
    price: 1620, etaDays: 3,
    message: 'Box trailer, standard service',
    status: 'ACCEPTED',
    createdAt: nowISO(),
    transporterUserId: t1.id,
  };
  DB.quotes.push(q3);

  const threadId = genId('thread');
  const b1 = {
    id: genId('booking'),
    shipmentId: s2.id,
    quoteId: q3.id,
    transporterCompany: q3.companyName,
    price: q3.price,
    status: 'BOOKED',
    threadId,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  DB.bookings.push(b1);
  s2.status = 'BOOKED';

  // Messages for that booking/thread
  DB.messages.push(
    { id: genId('msg'), threadId, senderRole: 'shipper', text: 'Hi, please confirm pickup window 08:00–10:00.', ts: nowISO() },
    { id: genId('msg'), threadId, senderRole: 'transporter', text: 'Confirmed. Driver will arrive ~08:30.', ts: nowISO() },
  );

  // Flag one shipment for moderation demo
  DB.flags.push({
    id: genId('flag'),
    shipmentId: s4.id,
    reason: 'Content',
    reporter: shipper.id,
    hidden: false,
    createdAt: nowISO(),
  });

  // Logs
  log('system', 'seed', '-', 'Demo data seeded');
  log('shipper', 'shipment', s1.id, 'Created shipment');
  log('transporter', 'quote', q1.id, 'Submitted quote');
  log('admin', 'booking', b1.id, 'Created booking from accepted quote');

  return {
    tokens: DB.tokens,
    counts: metricsCounts(),
  };
}

// -------------------------------------------------------------
// Helpers for API shapes
// -------------------------------------------------------------
function publicShipment(s) {
  return { ...s };
}
function publicQuote(q) {
  return { ...q };
}
function publicBooking(b) {
  const s = DB.shipments.find(x => x.id === b.shipmentId);
  return {
    ...b,
    route: s ? `${s.pickup} → ${s.dropoff}` : '',
    pickup: s?.pickup || '',
    dropoff: s?.dropoff || '',
    shipmentStatus: s?.status || '',
  };
}
function publicMessage(m) {
  return { ...m };
}
function publicDmThread(t) { return { ...t }; }
function publicDmMessage(m) { return { ...m }; }
function metricsCounts() {
  const pendingKYB = DB.users.filter(u => u.role === 'transporter' && !u.verified && !u.banned).length;
  return {
    shipments: DB.shipments.length,
    quotes: DB.quotes.length,
    bookings: DB.bookings.length,
    users: DB.users.length,
    pendingKYB,
    flags: DB.flags.length,
  };
}

// -------------------------------------------------------------
// Health & Seed
// -------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    ts: nowISO(),
    uptime: process.uptime(),
    counts: metricsCounts(),
  });
});

app.post('/seed', (req, res) => {
  const out = seed();
  res.json({
    ok: true,
    message: 'Seeded demo data',
    tokens: out.tokens,
    counts: out.counts,
  });
});

// -------------------------------------------------------------
// Demo Auth (cookie-based, httpOnly)
// -------------------------------------------------------------
app.post('/auth/demo-login', (req, res) => {
  const role = String((req.body && req.body.role) || '').toLowerCase();
  if (!['shipper', 'transporter', 'admin'].includes(role)) {
    return res.status(400).json({ ok: false, error: 'invalid role' });
  }
  // Set a simple demo session cookie with chosen role
  // Assign a demo userId based on role for DM access control
  const userId = role === 'shipper' ? 'user-0001' : role === 'transporter' ? 'user-0002' : 'user-0000';
  res.cookie('fm_session', JSON.stringify({ role, userId }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // secure can be enabled if serving over https
  });
  res.json({ ok: true, role });
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('fm_session', { path: '/' });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// Shipments
// -------------------------------------------------------------
app.get('/api/shipments', (req, res) => {
  const q = req.query || {};
  const status = (q.status || '').toString().toUpperCase();
  const pickupContains = (q.pickupContains || '').toString().toLowerCase();
  const dropoffContains = (q.dropoffContains || '').toString().toLowerCase();
  const service = (q.service || '').toString().toLowerCase();
  const adr = q.adr != null ? String(q.adr).toLowerCase() : '';
  const earliestDate = (q.earliestDate || '').toString();
  let list = DB.shipments.filter(s => !s.hidden);
  if (status) list = list.filter(s => String(s.status || '') === status);
  if (pickupContains) list = list.filter(s => String(s.pickup||'').toLowerCase().includes(pickupContains));
  if (dropoffContains) list = list.filter(s => String(s.dropoff||'').toLowerCase().includes(dropoffContains));
  if (service) list = list.filter(s => String(s.service||'').toLowerCase() === service);
  if (adr) list = list.filter(s => (!!s.adr) === (adr === 'true' || adr === '1' || adr === 'yes'));
  if (earliestDate) list = list.filter(s => !s.readyDate || String(s.readyDate) >= earliestDate);
  list = list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || String(b.id||'').localeCompare(String(a.id||'')));
  const limit = Math.min(Math.max(parseInt((q.limit||'20'), 10) || 20, 1), 100);
  const cursor = (q.cursor || '').toString();
  if (cursor) {
    const parts = cursor.split('|');
    const cAt = parts[0] || '';
    const cId = parts[1] || '';
    list = list.filter(x => (x.createdAt || '') + '|' + (x.id || '') < cAt + '|' + cId);
  }
  const page = list.slice(0, limit);
  const nextItem = list[limit];
  const nextCursor = nextItem ? ((nextItem.createdAt || '') + '|' + (nextItem.id || '')) : null;
  res.json({ data: page.map(publicShipment), nextCursor });
});

app.get('/api/shipments/:id', (req, res) => {
  const { id } = req.params;
  const s = DB.shipments.find(x => x.id === id);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  const quotes = DB.quotes.filter(q => q.shipmentId === id).map(publicQuote);
  res.json({ ok: true, data: { shipment: publicShipment(s), quotes } });
});

app.post('/api/shipments', (req, res) => {
  const body = req.body || {};
  const s = {
    id: genId('load'),
    title: (body.title || '').toString(),
    pickup: (body.pickup || '').toString(),
    dropoff: (body.dropoff || '').toString(),
    readyDate: (body.readyDate || '').toString(),
    weightKg: Number(body.weightKg || 0),
    volumeM3: Number(body.volumeM3 || 0),
    crossBorder: !!body.crossBorder,
    notes: (body.notes || '').toString(),
    service: (body.service || '').toString() || null,
    adr: body.adr != null ? !!body.adr : false,
    status: 'OPEN',
    hidden: false,
    ownerId: body.ownerId || null,
    createdAt: nowISO(),
  };
  if (!s.pickup || !s.dropoff) {
    return res.status(400).json({ ok: false, error: 'pickup and dropoff are required' });
  }
  DB.shipments.unshift(s);
  log('shipper', 'shipment', s.id, 'Created shipment');
  emitPublic('shipment:new', publicShipment(s));
  res.json({ ok: true, data: publicShipment(s) });
});

// -------------------------------------------------------------
// Quotes
// -------------------------------------------------------------
app.get('/api/quotes', (req, res) => {
  const { shipmentId } = req.query;
  if (!shipmentId) return res.status(400).json({ ok: false, error: 'shipmentId required' });
  const list = DB.quotes
    .filter(q => q.shipmentId === shipmentId)
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({ data: list.map(publicQuote) });
});

app.post('/api/quotes', (req, res) => {
  const body = req.body || {};
  const { shipmentId } = body;
  const s = DB.shipments.find(x => x.id === shipmentId);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  if (s.status !== 'OPEN') return res.status(400).json({ ok: false, error: 'shipment is not open for quotes' });

  const q = {
    id: genId('quote'),
    shipmentId,
    companyName: (body.companyName || 'Transporter').toString(),
    contactEmail: (body.contactEmail || '').toString(),
    price: Number(body.price || 0),
    etaDays: body.etaDays != null ? Number(body.etaDays) : null,
    message: (body.message || '').toString(),
    status: 'ACTIVE',
    createdAt: nowISO(),
    transporterUserId: body.transporterUserId || null,
  };
  DB.quotes.unshift(q);
  log('transporter', 'quote', q.id, `Submitted quote for ${shipmentId}`);
  res.json({ ok: true, data: publicQuote(q) });
});

app.post('/api/quotes/:id/accept', (req, res) => {
  const { id } = req.params;
  const q = DB.quotes.find(x => x.id === id);
  if (!q) return res.status(404).json({ ok: false, error: 'quote not found' });
  const s = DB.shipments.find(x => x.id === q.shipmentId);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  if (s.status !== 'OPEN') return res.status(400).json({ ok: false, error: 'shipment not open' });

  // Accept this quote; reject others on same shipment
  q.status = 'ACCEPTED';
  DB.quotes.forEach(other => {
    if (other.shipmentId === q.shipmentId && other.id !== q.id && other.status === 'ACTIVE') {
      other.status = 'REJECTED';
    }
  });

  s.status = 'BOOKED';
  const threadId = genId('thread');
  const booking = {
    id: genId('booking'),
    shipmentId: s.id,
    quoteId: q.id,
    transporterCompany: q.companyName,
    price: q.price,
    status: 'BOOKED',
    threadId,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  DB.bookings.unshift(booking);

  // Welcome message thread
  DB.messages.push({
    id: genId('msg'),
    threadId,
    senderRole: 'system',
    text: `Booking created for shipment ${s.id}. Use this thread to coordinate.`,
    ts: nowISO(),
  });

  log('shipper', 'booking', booking.id, `Accepted quote ${q.id}; booking created`);
  emitPublic('booking:new', publicBooking(booking));
  res.json({ ok: true, data: publicBooking(booking), threadId });
});

// -------------------------------------------------------------
// Bookings
// -------------------------------------------------------------
const BOOKING_STATUSES = ['BOOKED', 'ENROUTE', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

app.get('/api/bookings', (req, res) => {
  const list = DB.bookings
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(publicBooking);
  res.json({ data: list });
});

app.post('/api/bookings/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const b = DB.bookings.find(x => x.id === id);
  if (!b) return res.status(404).json({ ok: false, error: 'booking not found' });
  if (!BOOKING_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `invalid status: ${status}` });
  }
  b.status = status;
  b.updatedAt = nowISO();

  // Keep shipment in sync for headline views
  const s = DB.shipments.find(x => x.id === b.shipmentId);
  if (s) {
    if (status === 'DELIVERED') s.status = 'DELIVERED';
    if (status === 'CANCELLED') s.status = 'CANCELLED';
  }

  // Drop an automated message to the thread
  DB.messages.push({
    id: genId('msg'),
    threadId: b.threadId,
    senderRole: 'system',
    text: `Status updated to ${status}`,
    ts: nowISO(),
  });

  log('transporter', 'status', b.id, `Set status to ${status}`);
  emitPublic('booking:update', publicBooking(b));
  res.json({ ok: true, data: publicBooking(b) });
});

// -------------------------------------------------------------
// Quote aliases for shipment-specific routes
// -------------------------------------------------------------
app.get('/api/shipments/:id/quotes', (req, res) => {
  const { id } = req.params;
  const s = DB.shipments.find(x => x.id === id);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  const list = DB.quotes.filter(q => q.shipmentId === id).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  res.json({ data: list.map(publicQuote) });
});

app.post('/api/shipments/:id/quotes', (req, res) => {
  const { id } = req.params;
  const s = DB.shipments.find(x => x.id === id);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  if (s.status !== 'OPEN') return res.status(400).json({ ok: false, error: 'shipment is not open for quotes' });
  const body = req.body || {};
  const q = {
    id: genId('quote'),
    shipmentId: id,
    companyName: (body.companyName || 'Transporter').toString(),
    contactEmail: (body.contactEmail || '').toString(),
    price: Number(body.price || 0),
    etaDays: body.etaDays != null ? Number(body.etaDays) : null,
    message: (body.message || '').toString(),
    status: 'ACTIVE',
    createdAt: nowISO(),
    transporterUserId: body.transporterUserId || null,
  };
  DB.quotes.unshift(q);
  log('transporter', 'quote', q.id, `Submitted quote for ${id}`);
  emitPublic('quote:new', publicQuote(q));
  res.json({ ok: true, data: publicQuote(q) });
});

app.post('/api/shipments/:shipmentId/quotes/:quoteId/accept', (req, res) => {
  const { quoteId } = req.params;
  const q = DB.quotes.find(x => x.id === quoteId);
  if (!q) return res.status(404).json({ ok: false, error: 'quote not found' });
  const s = DB.shipments.find(x => x.id === q.shipmentId);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  if (s.status !== 'OPEN') return res.status(400).json({ ok: false, error: 'shipment not open' });

  q.status = 'ACCEPTED';
  DB.quotes.forEach(other => {
    if (other.shipmentId === q.shipmentId && other.id !== q.id && other.status === 'ACTIVE') {
      other.status = 'REJECTED';
    }
  });

  s.status = 'BOOKED';
  const threadId = genId('thread');
  const booking = {
    id: genId('booking'),
    shipmentId: s.id,
    quoteId: q.id,
    transporterCompany: q.companyName,
    price: q.price,
    status: 'BOOKED',
    threadId,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  DB.bookings.unshift(booking);
  DB.messages.push({ id: genId('msg'), threadId, senderRole: 'system', text: `Booking created for shipment ${s.id}. Use this thread to coordinate.`, ts: nowISO() });
  log('shipper', 'booking', booking.id, `Accepted quote ${q.id}; booking created`);
  emitPublic('booking:new', publicBooking(booking));
  res.json({ ok: true, data: publicBooking(booking), threadId });
});

// -------------------------------------------------------------
// Messages
// -------------------------------------------------------------
app.get('/api/messages', (req, res) => {
  const { threadId } = req.query;
  if (!threadId) return res.status(400).json({ ok: false, error: 'threadId required' });
  const list = DB.messages
    .filter(m => m.threadId === threadId)
    .slice()
    .sort((a, b) => (a.ts || '').localeCompare(b.ts || '')); // ascending
  res.json({ data: list.map(publicMessage) });
});

app.post('/api/messages', (req, res) => {
  const body = req.body || {};
  const { threadId, text, senderRole } = body;
  if (!threadId || !text) return res.status(400).json({ ok: false, error: 'threadId and text required' });

  // Optional: verify thread belongs to an existing booking
  const b = DB.bookings.find(x => x.threadId === threadId);
  if (!b) return res.status(404).json({ ok: false, error: 'thread not found' });

  const msg = {
    id: genId('msg'),
    threadId,
    senderRole: (senderRole || 'shipper').toString(),
    text: (text || '').toString(),
    ts: nowISO(),
  };
  DB.messages.push(msg);
  log(msg.senderRole, 'message', threadId, `+ ${msg.text.slice(0, 60)}`);
  res.json({ ok: true, data: publicMessage(msg) });
});

// -------------------------------------------------------------
// Admin
// -------------------------------------------------------------
app.get('/api/admin/metrics', (req, res) => {
  res.json({ ok: true, data: metricsCounts() });
});

app.get('/api/admin/verify', (req, res) => {
  const pending = DB.users
    .filter(u => u.role === 'transporter' && !u.verified && !u.banned)
    .map(u => ({
      userId: u.id,
      companyName: u.name,
      email: u.email,
      insurance: u.insurance || null,
      status: 'PENDING',
      since: u.createdAt,
    }));
  res.json({ ok: true, data: pending });
});

app.post('/api/admin/verify/:userId', (req, res) => {
  const { userId } = req.params;
  const { decision } = req.body || {};
  const u = DB.users.find(x => x.id === userId && x.role === 'transporter');
  if (!u) return res.status(404).json({ ok: false, error: 'transporter not found' });
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ ok: false, error: 'decision must be approve|reject' });
  }
  if (decision === 'approve') {
    u.verified = true;
  } else {
    u.verified = false;
  }
  log('admin', 'verify', u.id, `Decision: ${decision}`);
  res.json({ ok: true, data: { userId: u.id, verified: !!u.verified } });
});

app.get('/api/admin/users', (req, res) => {
  const list = DB.users.map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role,
    status: u.banned ? 'BANNED' : 'ACTIVE',
    verified: !!u.verified,
    createdAt: u.createdAt,
  }));
  res.json({ ok: true, data: list });
});

app.post('/api/admin/users/:userId/ban', (req, res) => {
  const { userId } = req.params;
  const { ban } = req.body || {};
  const u = DB.users.find(x => x.id === userId);
  if (!u) return res.status(404).json({ ok: false, error: 'user not found' });
  u.banned = !!ban;
  log('admin', 'ban', u.id, `ban=${!!ban}`);
  res.json({ ok: true, data: { userId: u.id, banned: u.banned } });
});

app.get('/api/admin/transporters', (req, res) => {
  const list = DB.users
    .filter(u => u.role === 'transporter' && u.verified)
    .map(u => ({
      id: u.id, company: u.name, contact: u.email,
      insurance: u.insurance || '—',
      since: (u.createdAt || '').slice(0, 10),
      banned: !!u.banned,
    }));
  res.json({ ok: true, data: list });
});

app.get('/api/admin/flagged', (req, res) => {
  const list = DB.flags.map(f => {
    const s = DB.shipments.find(x => x.id === f.shipmentId);
    return {
      id: f.id,
      shipmentId: f.shipmentId,
      route: s ? `${s.pickup} → ${s.dropoff}` : '',
      reason: f.reason,
      reporter: f.reporter,
      hidden: !!f.hidden,
      createdAt: f.createdAt,
    };
  });
  res.json({ ok: true, data: list });
});

app.post('/api/admin/flagged/:shipmentId/hide', (req, res) => {
  const { shipmentId } = req.params;
  const { hide } = req.body || {};
  const s = DB.shipments.find(x => x.id === shipmentId);
  if (!s) return res.status(404).json({ ok: false, error: 'shipment not found' });
  s.hidden = !!hide;
  const f = DB.flags.find(x => x.shipmentId === shipmentId);
  if (f) f.hidden = !!hide;
  log('admin', 'flag', shipmentId, `hidden=${!!hide}`);
  res.json({ ok: true, data: { shipmentId, hidden: !!hide } });
});

app.get('/api/admin/logs', (req, res) => {
  res.json({ ok: true, data: DB.logs.slice(0, 200) });
});

app.delete('/api/admin/wipe', (req, res) => {
  clearAll();
  log('admin', 'wipe', '-', 'All demo data wiped');
  res.json({ ok: true, message: 'All demo data wiped' });
});

// -------------------------------------------------------------
// Direct Messages (DM) — secure inbox per user
// -------------------------------------------------------------
function getSession(req){
  try { return JSON.parse(req.cookies.fm_session || '{}'); } catch(e){ return {}; }
}
function requireAuth(req, res){
  const s = getSession(req);
  if (!s || !s.userId) { res.status(401).json({ ok:false, error:'unauthorized' }); return null; }
  return s;
}

// List DM threads for current user
app.get('/api/dm/threads', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const list = DB.dmThreads.filter(t => t.members && t.members.includes(s.userId)).slice().sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''));
  res.json({ ok:true, data: list.map(publicDmThread) });
});

// Create or fetch a DM thread with another user
app.post('/api/dm/threads', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const otherId = String((req.body && req.body.otherUserId) || '').trim();
  if (!otherId) return res.status(400).json({ ok:false, error:'otherUserId required' });
  let t = DB.dmThreads.find(x => Array.isArray(x.members) && x.members.length===2 && x.members.includes(s.userId) && x.members.includes(otherId));
  if (!t) {
    t = { id: genId('thread'), type:'dm', members:[s.userId, otherId], createdAt: nowISO(), updatedAt: nowISO() };
    DB.dmThreads.unshift(t);
  }
  res.json({ ok:true, data: publicDmThread(t) });
});

// List messages for a DM thread (authz check)
app.get('/api/dm/messages', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const threadId = String((req.query && req.query.threadId) || '');
  const t = DB.dmThreads.find(x => x.id === threadId);
  if (!t || !t.members.includes(s.userId)) return res.status(403).json({ ok:false, error:'forbidden' });
  const list = DB.dmMessages.filter(m => m.threadId === threadId).slice().sort((a,b)=> (a.ts||'').localeCompare(b.ts||''));
  res.json({ ok:true, data: list.map(publicDmMessage) });
});

// Send message to a DM thread (authz check)
app.post('/api/dm/messages', (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const body = req.body || {};
  const threadId = String(body.threadId || '');
  const text = String(body.text || '').trim();
  if (!threadId || !text) return res.status(400).json({ ok:false, error:'threadId and text required' });
  const t = DB.dmThreads.find(x => x.id === threadId);
  if (!t || !t.members.includes(s.userId)) return res.status(403).json({ ok:false, error:'forbidden' });
  const msg = { id: genId('msg'), threadId, senderId: s.userId, text, ts: nowISO() };
  DB.dmMessages.push(msg);
  t.updatedAt = nowISO();
  try { emitToUsers(t.members, 'dm:new', { threadId, message: publicDmMessage(msg) }); } catch(e) {}
  res.json({ ok:true, data: publicDmMessage(msg) });
});

// -------------------------------------------------------------
// Payments (Stripe Payment Intents + Webhook)
// -------------------------------------------------------------
app.post('/api/payments/create-intent', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ ok:false, error:'Stripe not configured' });
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ ok:false, error:'bookingId required' });
    const b = DB.bookings.find(x => x.id === bookingId);
    if (!b) return res.status(404).json({ ok:false, error:'booking not found' });
    const amount = Math.round(Number(b.price || 0) * 100);
    if (!(amount > 0)) return res.status(400).json({ ok:false, error:'invalid amount' });
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      metadata: { bookingId: b.id, shipmentId: b.shipmentId },
      automatic_payment_methods: { enabled: true },
    });
    res.json({ ok:true, clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message || 'stripe error' });
  }
});

// Publishable key endpoint for client to initialize Stripe
app.get('/api/payments/publishable-key', (req, res) => {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
  if (!pk) return res.status(500).json({ ok:false, error:'Stripe publishable key not set' });
  res.json({ ok:true, publishableKey: pk });
});

// Webhook for payment events (must use raw body for verification)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(500).end();
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const bookingId = pi.metadata && pi.metadata.bookingId;
    const b = DB.bookings.find(x => x.id === bookingId);
    if (b) {
      b.paid = true;
      b.updatedAt = nowISO();
      log('system', 'payment', b.id, 'Payment captured');
      emitPublic('booking:update', publicBooking(b));
    }
  }
  res.json({ received: true });
});

// After webhook is registered, enable JSON body parsing for the rest of the app
app.use(express.json({ limit: '1mb' }));

// -------------------------------------------------------------
// Start server
// -------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Duff Bros Freight API running on http://localhost:${PORT}`);
});
