require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the ticket panel in this channel (admin only)'),
  new SlashCommandBuilder()
    .setName('post-shop')
    .setDescription('Post the shop embed in your shop channel (admin only)'),
  new SlashCommandBuilder()
    .setName('manual-log')
    .setDescription('Log a deal made outside Discord (admin only)'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
).then(() => console.log('✅ Slash commands registered.'))
  .catch(console.error);