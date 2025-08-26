// server.js
// Duff Bros Freight — demo API (in-memory)
// Run: node server.js  (defaults to http://localhost:3000)

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// Middleware
// -------------------------------------------------------------
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

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
// Shipments
// -------------------------------------------------------------
app.get('/api/shipments', (req, res) => {
  const list = DB.shipments
    .filter(s => !s.hidden)
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({ data: list.map(publicShipment) });
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
  res.json({ ok: true, data: publicBooking(b) });
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
// Start server
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Duff Bros Freight API running on http://localhost:${PORT}`);
});
