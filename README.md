<div align="center">

<img src="https://i.ibb.co/7dLKQDxQ/Ebisu-Profile.png" width="30%" />

# 恵 ¦ Ebisu

### Multi-Seller Discord Market Bot & Dashboard

*A production-ready Discord bot with a live shop, ticket system, vouch logging, and a full web dashboard — built for serious sellers.*

---

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge\&logo=nodedotjs\&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge\&logo=discord\&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge\&logo=docker\&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-database-003B57?style=for-the-badge\&logo=sqlite\&logoColor=white)

</div>

---

## ✦ Overview

**Ebisu** is a scalable multi-seller Discord marketplace system designed for automation, security, and ease of use.

It combines:

* a **Discord bot** (tickets, shop, vouches)
* a **web dashboard** (seller + admin control)
* and a **self-contained Docker setup**

---

## ✦ Features

* 🎫 **Ticket System** — One active ticket per buyer, per seller
* 🛍️ **Live Shop Embed** — Auto-updating shop with stock + categories
* ⭐ **Vouch System** — Buyer confirmation required before logging
* 📋 **Purchase Logs** — Full transaction tracking
* 📢 **Stock Notifications** — Alerts when items sell out/restock
* 🖥️ **Web Dashboard** — Full seller & admin control panel
* 🔒 **Multi-Seller Isolation** — Each seller has independent data
* 🐳 **Docker Ready** — One-command deployment

---

## ✦ Tech Stack

| Layer     | Tool                     |
| --------- | ------------------------ |
| Bot       | Discord.js v14           |
| Database  | SQLite (better-sqlite3)  |
| Dashboard | Express + Vanilla JS     |
| Auth      | express-session + bcrypt |
| Runtime   | Node.js 22               |
| Hosting   | Docker                   |

---

## ✦ Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Takumi-Labs-Dev/Ebisu.git
cd Ebisu
npm install
```

---

### 2. Setup environment variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Then edit it:

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_server_id
SESSION_SECRET=a_long_random_string
DASHBOARD_PORT=3002
DB_PATH=./database.sqlite
```

---

### 3. Register slash commands

```bash
node bot/deploy-commands.js
```

---

### 4. Create admin account

```bash
node -e "const db = require('./bot/db/index.js'); db.createUser('admin','yourpassword','admin').then(id => { console.log('Admin created, id:', id); process.exit(0); })"
```

---

### 5. Run the app

#### Option A — Docker (recommended)

```bash
docker-compose up --build -d
```

#### Option B — Local

```bash
node bot/index.js
node dashboard/server.js
```

---

### 6. Access dashboard

```
http://localhost:3002
```

---

## ✦ Bot Commands

| Command         | Description         |
| --------------- | ------------------- |
| `/ticket-panel` | Create ticket panel |
| `/post-shop`    | Post shop embed     |
| `/manual-log`   | Log external deals  |

---

## ✦ How It Works

```
Buyer clicks "Purchase"
↓
Private ticket is created
↓
Seller inputs deal details
↓
Buyer confirms vouch
↓
Stock updates + logs saved
↓
Vouch posted automatically
```

---

## ✦ Dashboard

| Page         | Access | Description           |
| ------------ | ------ | --------------------- |
| Shop Manager | Seller | Manage items & stock  |
| Config       | Seller | Set channels & embeds |
| Purchase Log | Seller | View sales            |
| Admin Panel  | Admin  | Manage sellers        |

---

## ✦ Environment Variables

| Variable       | Description            |
| -------------- | ---------------------- |
| BOT_TOKEN      | Discord bot token      |
| CLIENT_ID      | Discord application ID |
| GUILD_ID       | Server ID              |
| SESSION_SECRET | Session encryption     |
| DASHBOARD_PORT | Dashboard port         |
| DB_PATH        | SQLite database path   |

---

## ✦ Notes

* `node_modules`, `.env`, and build files are **ignored for security and performance**
* Database is auto-created on first run
* Designed for **scaling into SaaS deployments**

---

## ✦ License

Private — All rights reserved © Takumi Labs
