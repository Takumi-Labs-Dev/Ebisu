require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ─── Seller resolution ────────────────────────────────────────────────────────
// Every interaction hits this first. Given a Discord channel ID,
// find which seller owns it by checking all config columns.

const resolveSellerByChannel = db.prepare(`
  SELECT u.*, sc.*
  FROM seller_config sc
  JOIN users u ON u.id = sc.seller_id
  WHERE sc.shop_channel_id          = ?
     OR sc.vouch_channel_id         = ?
     OR sc.log_channel_id           = ?
     OR sc.stock_updates_channel_id = ?
  LIMIT 1
`);

const resolveSellerByTicketChannel = db.prepare(`
  SELECT u.*, sc.*
  FROM tickets t
  JOIN users u ON u.id = t.seller_id
  JOIN seller_config sc ON sc.seller_id = t.seller_id
  WHERE t.channel_id = ?
  LIMIT 1
`);

const resolveSellerByCategory = db.prepare(`
  SELECT u.*, sc.*
  FROM seller_config sc
  JOIN users u ON u.id = sc.seller_id
  WHERE sc.ticket_category_id = ?
  LIMIT 1
`);

function resolveSellerFromInteraction(interaction) {
  const channelId = interaction.channelId;
  const categoryId = interaction.channel?.parentId;

  const byChannel = resolveSellerByChannel.get(channelId, channelId, channelId, channelId);
  if (byChannel) return byChannel;

  const byTicket = resolveSellerByTicketChannel.get(channelId);
  if (byTicket) return byTicket;

  if (categoryId) {
    const byCategory = resolveSellerByCategory.get(categoryId);
    if (byCategory) return byCategory;
  }

  return null;
}

// ─── Users ────────────────────────────────────────────────────────────────────
const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const getAllSellers = () => db.prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC").all();

async function createUser(username, password, role = 'seller') {
  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
  db.prepare('INSERT INTO seller_config (seller_id) VALUES (?)').run(result.lastInsertRowid);
  return result.lastInsertRowid;
}

async function verifyPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password_hash);
  return match ? user : null;
}

async function updatePassword(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

function deleteUser(userId) {
  db.prepare('DELETE FROM purchases WHERE seller_id = ?').run(userId);
  db.prepare('DELETE FROM tickets WHERE seller_id = ?').run(userId);
  db.prepare('DELETE FROM items WHERE seller_id = ?').run(userId);
  db.prepare('DELETE FROM seller_config WHERE seller_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

// ─── Seller config ────────────────────────────────────────────────────────────
const getSellerConfig = (sellerId) => db.prepare('SELECT * FROM seller_config WHERE seller_id = ?').get(sellerId);

function saveSellerConfig(sellerId, fields) {
  const allowed = [
    'shop_channel_id',
    'ticket_panel_channel_id',
    'ticket_category_id',
    'vouch_channel_id',
    'log_channel_id',
    'stock_updates_channel_id',
    'customer_role_id',
    'shop_message_id'
  ];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const updates = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`UPDATE seller_config SET ${updates} WHERE seller_id = ?`).run(...values, sellerId);
}

function setShopMessageId(sellerId, messageId) {
  db.prepare('UPDATE seller_config SET shop_message_id = ? WHERE seller_id = ?').run(messageId, sellerId);
}

// ─── Items ────────────────────────────────────────────────────────────────────
const getAllItems = (sellerId) =>
  db.prepare('SELECT * FROM items WHERE seller_id = ? AND visible = 1 ORDER BY sort_order, id').all(sellerId);

const getAllItemsIncludingHidden = (sellerId) =>
  db.prepare('SELECT * FROM items WHERE seller_id = ? ORDER BY sort_order, id').all(sellerId);

const getItem = (sellerId, itemId) =>
  db.prepare('SELECT * FROM items WHERE id = ? AND seller_id = ?').get(itemId, sellerId);

function upsertItem(sellerId, id, name, emoji, quantity, visible = 1, price = '', is_category = 0, sort_order = 0) {
  if (id) {
    db.prepare('UPDATE items SET name=?, emoji=?, quantity=?, visible=?, price=?, is_category=?, sort_order=? WHERE id=? AND seller_id=?')
      .run(name, emoji, Math.max(0, is_category ? 0 : quantity), visible, price||'', is_category, sort_order, id, sellerId);
  } else {
    db.prepare('INSERT INTO items (seller_id, name, emoji, quantity, visible, price, is_category, sort_order) VALUES (?,?,?,?,?,?,?,?)')
      .run(sellerId, name, emoji, Math.max(0, is_category ? 0 : quantity), visible, price||'', is_category, sort_order);
  }
}

function updateItemQty(sellerId, itemId, delta) {
  db.prepare('UPDATE items SET quantity = MAX(0, quantity + ?) WHERE id = ? AND seller_id = ?')
    .run(delta, itemId, sellerId);
}

function deleteItem(sellerId, itemId) {
  db.prepare('DELETE FROM items WHERE id = ? AND seller_id = ?').run(itemId, sellerId);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────
function openTicket(sellerId, discordId, channelId) {
  db.prepare('INSERT INTO tickets (seller_id, discord_id, channel_id) VALUES (?,?,?)').run(sellerId, discordId, channelId);
}

function closeTicket(channelId) {
  db.prepare("UPDATE tickets SET status='closed' WHERE channel_id=?").run(channelId);
}

function getOpenTicket(sellerId, discordId) {
  return db.prepare("SELECT * FROM tickets WHERE seller_id=? AND discord_id=? AND status='open'").get(sellerId, discordId);
}

// ─── Purchases ────────────────────────────────────────────────────────────────
function logPurchase(sellerId, discordId, discordTag, itemsArray, amount, type = 'auto', ticketId = null) {
  db.prepare(`
    INSERT INTO purchases (seller_id, discord_id, discord_tag, items_json, amount, type, ticket_id)
    VALUES (?,?,?,?,?,?,?)
  `).run(sellerId, discordId, discordTag, JSON.stringify(itemsArray), amount, type, ticketId);
}

const getAllPurchases = (sellerId) =>
  db.prepare('SELECT * FROM purchases WHERE seller_id = ? ORDER BY date DESC').all(sellerId);

const getPurchaseStats = (sellerId) =>
  db.prepare(`
    SELECT COUNT(*) as total_sales, COUNT(DISTINCT discord_id) as unique_buyers
    FROM purchases WHERE seller_id = ?
  `).get(sellerId);

module.exports = {
  db,
  resolveSellerFromInteraction,
  getUserById, getUserByUsername, getAllSellers,
  createUser, verifyPassword, updatePassword, deleteUser,
  getSellerConfig, saveSellerConfig, setShopMessageId,
  getAllItems, getAllItemsIncludingHidden, getItem, upsertItem, updateItemQty, deleteItem,
  openTicket, closeTicket, getOpenTicket,
  logPurchase, getAllPurchases, getPurchaseStats,
};