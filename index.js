require('dotenv').config();

// Start dashboard first (non-blocking)
require('./dashboard/server.js');

// Start bot
require('./bot/index.js');