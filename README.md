<div align="center">

<img src="https://i.ibb.co/7dLKQDxQ/Ebisu-Profile.png" width="30%" />

# 恵 ¦ Ebisu
### Multi-Seller Discord Market Bot & Dashboard

*A production-ready Discord bot with a live shop, ticket system, vouch logging, and a web dashboard — built for sellers.*

---

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-database-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

</div>

---

## ✦ Features

- **🎫 Ticket System** — Buyers open private tickets per seller. One ticket at a time enforced.
- **🛍️ Live Shop Embed** — Auto-updates on every vouch. Categories, prices, stock status.
- **⭐ Vouch System** — Seller fills deal info, buyer confirms. Posts to vouches channel automatically.
- **📋 Purchase Log** — Every transaction logged with buyer, items, amount, and timestamp.
- **📢 Stock Notifications** — Pings a role when items sell out or get restocked.
- **🖥️ Web Dashboard** — Sellers manage their own shop, config, and sales. Admin manages all sellers.
- **🐳 Docker Ready** — Runs in a single container. Zero dependency headaches.
- **🔒 Multi-Seller** — Each seller has isolated items, channels, purchases, and config.

---

## ✦ Tech Stack

| Layer | Tool |
|---|---|
| Bot | Discord.js v14 |
| Database | SQLite (better-sqlite3) |
| Dashboard | Express + Vanilla JS |
| Auth | express-session + bcrypt |
| Runtime | Node.js 22 |
| Hosting | Docker |
| Tunnel | ngrok / Cloudflare |

---

## ✦ Setup

### Prerequisites
- Node.js 22+
- Docker Desktop
- A Discord bot token

### 1. Clone the repo
```bash
git clone https://github.com/Takumi-Labs-Dev/Ebisu.git
cd Ebisu
npm install
```

### 2. Create your `.env` file
```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_server_id
SESSION_SECRET=a_long_random_string
DASHBOARD_PORT=3002
DB_PATH=./database.sqlite
```

### 3. Register slash commands
```bash
node bot/deploy-commands.js
```

### 4. Create your admin account
```bash
node -e "const db = require('./bot/db/index.js'); db.createUser('admin','yourpassword','admin').then(id => { console.log('Admin created, id:', id); process.exit(0); })"
```

### 5. Start with Docker
```bash
docker-compose up --build -d
```

### 6. Open the dashboard
http://localhost:3002

---

## ✦ Bot Commands

| Command | Description |
|---|---|
| `/ticket-panel` | Posts the ticket panel embed in the current channel |
| `/post-shop` | Posts the shop embed in your configured shop channel |
| `/manual-log` | Logs a deal made outside Discord |

---

## ✦ How It Works
Buyer clicks Purchase in ticket panel
↓
Private ticket channel created
↓
Seller fills deal info (items + amount)
↓
Buyer clicks Submit Vouch
↓
Stock subtracted → Shop embed updated
Purchase logged → Vouch posted
Stock notification sent

---

## ✦ Dashboard Pages

| Page | Access | Description |
|---|---|---|
| Shop Manager | Seller | Add/edit items, categories, prices, quantities |
| Config | Seller | Set channel IDs, post embeds |
| Purchase Log | Seller | View all sales and stats |
| Admin | Admin only | Create/delete seller accounts |

---

## ✦ Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Your Discord bot token |
| `CLIENT_ID` | Your Discord application ID |
| `GUILD_ID` | Your Discord server ID |
| `SESSION_SECRET` | Random string for session encryption |
| `DASHBOARD_PORT` | Port the dashboard runs on (default 3002) |
| `DB_PATH` | Path to SQLite database file |

---

## ✦ License

Private — All rights reserved © Takumi Labs

</div>
