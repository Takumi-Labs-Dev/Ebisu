require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { resolveSellerFromInteraction, getAllSellers, getUserById, getSellerConfig } = require('./db/index.js');
const ticketHandler = require('./handlers/ticketHandler.js');
const vouchHandler  = require('./handlers/vouchHandler.js');
const logHandler    = require('./handlers/logHandler.js');
const { postShopEmbed, updateShopEmbed } = require('./handlers/shopHandler.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once('ready', async () => {
  console.log(`✅ 恵 ¦ Ebisu online as ${client.user.tag}`);

  // Refresh all shop embeds on boot
  const sellers = getAllSellers();
  for (const seller of sellers) {
    const config = getSellerConfig(seller.id);
    if (config?.shop_channel_id && config?.shop_message_id) {
      await updateShopEmbed(client, seller).catch(() => {});
    }
  }

  // ── Event listeners — must be inside ready so client is connected ──────────
  const events = require('./events.js');

  events.on('updateShopEmbed', async (sellerId) => {
    try {
      const seller = getUserById(sellerId);
      if (seller) await updateShopEmbed(client, seller);
    } catch (e) { console.error('[events] updateShopEmbed failed:', e.message); }
  });

  events.on('postShopEmbed', async (sellerId) => {
    try {
      const seller = getUserById(sellerId);
      if (seller) await postShopEmbed(client, seller);
    } catch (e) { console.error('[events] postShopEmbed failed:', e.message); }
  });

  events.on('postTicketEmbed', async (sellerId) => {
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const seller = getUserById(sellerId);
      const config = getSellerConfig(sellerId);
      if (!config?.ticket_panel_channel_id) {
        console.warn('[events] postTicketEmbed: no ticket_panel_channel_id set');
        return;
      }
      const channel = await client.channels.fetch(config.ticket_panel_channel_id);
      const embed = new EmbedBuilder()
        .setTitle('✦ 恵 ¦ Ebisu — Support & Purchases')
        .setDescription('Click a button below to open a private ticket.\nOne ticket per member at a time.')
        .setColor(0x7C3AED)
        .setFooter({ text: '恵 ¦ Ebisu' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket_purchase_${seller.id}`)
          .setLabel('Purchase').setEmoji('🛒').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`open_ticket_support_${seller.id}`)
          .setLabel('Support').setEmoji('❓').setStyle(ButtonStyle.Secondary),
      );
      await channel.send({ embeds: [embed], components: [row] });
      console.log(`[events] Ticket panel posted for seller ${sellerId}`);
    } catch (e) { console.error('[events] postTicketEmbed failed:', e.message); }
  });

  events.on('stockRestock', async ({ sellerId, restocked }) => {
    try {
      const config = getSellerConfig(sellerId);
      if (!config?.stock_updates_channel_id) return;
      const channel = await client.channels.fetch(config.stock_updates_channel_id);
      const ping  = config.customer_role_id ? `<@&${config.customer_role_id}> ` : '';
      const lines = restocked.map(i => `${i.emoji || '•'} **${i.name}** — ✅ ${i.quantity} now in stock`);
      await channel.send({ content: `${ping}**Restock alert!**\n${lines.join('\n')}` });
    } catch (e) { console.error('[events] stockRestock failed:', e.message); }
  });

});

client.on('interactionCreate', async (interaction) => {
  try {

    // ── Buttons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {

      if (interaction.customId.startsWith('open_ticket_')) {
        const parts    = interaction.customId.split('_');
        const sellerId = parseInt(parts[parts.length - 1]);
        const seller   = getUserById(sellerId);
        if (!seller) return safeReply(interaction, '❌ Seller not found.');
        return ticketHandler.handleOpen(interaction, seller);
      }

      const seller = resolveSellerFromInteraction(interaction);
      if (!seller) return;

      if (interaction.customId === 'close_ticket') {
        return ticketHandler.handleClose(interaction);
      }
      if (interaction.customId === 'submit_vouch') {
        return vouchHandler.showModal(interaction, seller);
      }
      if (interaction.customId.startsWith('fill_deal_')) {
        return vouchHandler.showFillDealModal(interaction, seller);
      }
    }

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {

      if (interaction.customId === 'vouch_modal') {
        const seller = resolveSellerFromInteraction(interaction);
        if (!seller) return safeReply(interaction, '❌ Could not resolve seller.');
        return vouchHandler.handleSubmit(interaction, client, seller);
      }

      if (interaction.customId.startsWith('manual_log_modal_')) {
        const sellerId = parseInt(interaction.customId.replace('manual_log_modal_', ''));
        const seller   = getUserById(sellerId);
        if (!seller) return safeReply(interaction, '❌ Seller not found.');
        return logHandler.handleManualLog(interaction, client, seller);
      }

      if (interaction.customId.startsWith('fill_deal_modal_')) {
        const seller = resolveSellerFromInteraction(interaction);
        if (!seller) return safeReply(interaction, '❌ Could not resolve seller.');
        return vouchHandler.saveDealInfo(interaction, seller);
      }
    }

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'ticket-panel') {
        const seller = resolveSellerFromInteraction(interaction);
        if (!seller) return interaction.reply({ content: '❌ This channel is not configured for any seller.', ephemeral: true });
        return ticketHandler.postPanel(interaction, seller);
      }

      if (interaction.commandName === 'post-shop') {
        const seller = resolveSellerFromInteraction(interaction);
        if (!seller) return interaction.reply({ content: '❌ This channel is not configured for any seller.', ephemeral: true });
        return postShopEmbed(client, seller)
          .then(() => interaction.reply({ content: '✅ Shop embed posted.', ephemeral: true }))
          .catch(e => interaction.reply({ content: `❌ ${e.message}`, ephemeral: true }));
      }

      if (interaction.commandName === 'manual-log') {
        let seller = resolveSellerFromInteraction(interaction);
        if (!seller) {
          const sellers = getAllSellers();
          if (!sellers.length) return interaction.reply({ content: '❌ No sellers configured.', ephemeral: true });
          seller = getUserById(sellers[0].id);
        }
        return logHandler.showModal(interaction, seller);
      }
    }

  } catch (err) {
    console.error('[interaction error]', err);
    safeReply(interaction, '❌ Something went wrong. Please try again.');
  }
});

async function safeReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch {}
}

client.login(process.env.BOT_TOKEN);
module.exports = client;