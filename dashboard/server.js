require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);

const {
  db, verifyPassword, createUser, getAllSellers, deleteUser, updatePassword,
  getSellerConfig, saveSellerConfig,
  getAllItemsIncludingHidden, upsertItem, deleteItem,
  getAllPurchases, getPurchaseStats,
} = require('../bot/db/index.js');

const { requireAuth, requireAdmin } = require('./middleware/auth.js');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new BetterSqlite3Store({ client: db }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// Static files — login page is served from root
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await verifyPassword(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;
  res.json({ ok: true, role: user.role });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/auth/me', (req, res) => {
  if (!req.session?.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username, role: req.session.role });
});

// ─── Seller: items ────────────────────────────────────────────────────────────

app.get('/api/items', requireAuth, (req, res) => {
  res.json(getAllItemsIncludingHidden(req.session.userId));
});

app.post('/api/items/save', requireAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  const { db } = require('../bot/db/index.js');

  const before = {};
  getAllItemsIncludingHidden(req.session.userId).forEach(i => { before[i.id] = i.quantity; });

  const existingIds = db.prepare('SELECT id FROM items WHERE seller_id = ?').all(req.session.userId).map(r => r.id);
  const incomingIds = items.filter(i => i.id).map(i => i.id);
  const toDelete = existingIds.filter(id => !incomingIds.includes(id));
  for (const id of toDelete) deleteItem(req.session.userId, id);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    upsertItem(
      req.session.userId,
      item.id || null,
      item.name,
      item.emoji || '',
      parseInt(item.quantity) || 0,
      item.visible === false ? 0 : 1,
      item.price || '',
      item.is_category ? 1 : 0,
      i
    );
  }

  // Signal bot via event emitter — no direct require
  const events = require('../bot/events.js');
  events.emit('updateShopEmbed', req.session.userId);

  // Restock notification
  try {
    const config = getSellerConfig(req.session.userId);
    if (config?.stock_updates_channel_id) {
      const after = getAllItemsIncludingHidden(req.session.userId);
      const restocked = after.filter(i => {
        if (i.is_category) return false;
        return (before[i.id] ?? 0) === 0 && i.quantity > 0;
      });
      if (restocked.length > 0) {
        events.emit('stockRestock', {
          sellerId: req.session.userId,
          restocked
        });
      }
    }
  } catch (e) {
    console.warn('[dashboard] restock check failed:', e.message);
  }

  res.json({ ok: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  deleteItem(req.session.userId, parseInt(req.params.id));
  res.json({ ok: true });
});

// ─── Seller: config ───────────────────────────────────────────────────────────

app.get('/api/config', requireAuth, (req, res) => {
  res.json(getSellerConfig(req.session.userId) || {});
});

app.post('/api/config/save', requireAuth, (req, res) => {
  const allowed = [
    'shop_channel_id',
    'ticket_panel_channel_id',
    'ticket_category_id',
    'vouch_channel_id',
    'log_channel_id',
    'stock_updates_channel_id',
    'customer_role_id'
  ];
  const fields = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  saveSellerConfig(req.session.userId, fields);
  res.json({ ok: true });
});

// ─── Seller: purchases ────────────────────────────────────────────────────────

app.get('/api/purchases', requireAuth, (req, res) => {
  const purchases = getAllPurchases(req.session.userId).map(p => ({
    ...p,
    items_json: JSON.parse(p.items_json)
  }));
  res.json(purchases);
});

app.get('/api/stats', requireAuth, (req, res) => {
  res.json(getPurchaseStats(req.session.userId));
});

// ─── Admin: manage sellers ────────────────────────────────────────────────────

app.get('/api/admin/sellers', requireAdmin, (req, res) => {
  res.json(getAllSellers());
});

app.post('/api/admin/sellers', requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  try {
    const id = await createUser(username, password, 'seller');
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: 'Username already taken.' });
  }
});

app.delete('/api/admin/sellers/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself.' });
  deleteUser(id);
  res.json({ ok: true });
});

app.post('/api/admin/sellers/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required.' });
  await updatePassword(parseInt(req.params.id), password);
  res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.DASHBOARD_PORT || 3002;

// ─── Post shop embed from dashboard ──────────────────────────────────────────
app.post('/api/shop/post', requireAuth, async (req, res) => {
  const config = getSellerConfig(req.session.userId);
  if (!config?.shop_channel_id) return res.status(400).json({ error: 'No shop channel ID set.' });
  const events = require('../bot/events.js');
  events.emit('postShopEmbed', req.session.userId);
  res.json({ ok: true });
});

// ─── Post ticket panel ────────────────────────────────────────────────────────
app.post('/api/ticket/post', requireAuth, async (req, res) => {
  const config = getSellerConfig(req.session.userId);
  if (!config?.ticket_panel_channel_id) return res.status(400).json({ error: 'No ticket panel channel ID set.' });
  const events = require('../bot/events.js');
  events.emit('postTicketEmbed', req.session.userId);
  res.json({ ok: true });
});

// ─── Delete purchase ──────────────────────────────────────────────────────────
app.delete('/api/purchases/:id', requireAuth, (req, res) => {
  const { db } = require('../bot/db/index.js');
  db.prepare('DELETE FROM purchases WHERE id = ? AND seller_id = ?')
    .run(parseInt(req.params.id), req.session.userId);
  res.json({ ok: true });
});

// ─── Upload profile picture ───────────────────────────────────────────────────
const multer = require('multer');
const uploadDir = path.join(__dirname, 'public', 'avatars');
if (!require('fs').existsSync(uploadDir)) require('fs').mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `avatar_${req.session.userId}.png`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/profile/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  res.json({ ok: true, path: `/avatars/avatar_${req.session.userId}.png` });
});

app.get('/api/profile', requireAuth, (req, res) => {
  const { getUserById, getAllItemsIncludingHidden, getAllPurchases, getPurchaseStats } = require('../bot/db/index.js');
  const user = getUserById(req.session.userId);
  const items = getAllItemsIncludingHidden(req.session.userId);
  const stats = getPurchaseStats(req.session.userId);
  const avatarPath = `/avatars/avatar_${req.session.userId}.png`;
  const avatarExists = require('fs').existsSync(path.join(__dirname, 'public', 'avatars', `avatar_${req.session.userId}.png`));
  res.json({
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    total_items: items.length,
    visible_items: items.filter(i => i.visible).length,
    total_sales: stats.total_sales,
    unique_buyers: stats.unique_buyers,
    avatar: avatarExists ? avatarPath : null,
  });
});

// ─── Change own password ──────────────────────────────────────────────────────
app.post('/api/profile/password', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { updatePassword } = require('../bot/db/index.js');
  await updatePassword(req.session.userId, password);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running at http://localhost:${PORT}`);
});

module.exports = app;