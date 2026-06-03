const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder
} = require('discord.js');
const { getAllItems, updateItemQty, logPurchase, getSellerConfig } = require('../db/index.js');
const { updateShopEmbed } = require('./shopHandler.js');

async function showModal(interaction, seller) {
  const items = getAllItems(seller.id).filter(i => !i.is_category);
  const itemList = items.map(i => `${i.id}:${i.name}`).join(', ');

  const modal = new ModalBuilder()
    .setCustomId(`manual_log_modal_${seller.id}`)
    .setTitle('Manual purchase log');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('discord_id')
        .setLabel('Client Discord ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 123456789012345678')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items_bought')
        .setLabel('Items (ItemName:qty, ItemName:qty)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`e.g. Fritz:1, Kengo:2`)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount paid')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('date_override')
        .setLabel('Date (leave blank for today)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. 2025-05-28')
    ),
  );

  await interaction.showModal(modal);
}

async function handleManualLog(interaction, client, seller) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.fields.getTextInputValue('discord_id');
  const rawItems  = interaction.fields.getTextInputValue('items_bought');
  const amount    = interaction.fields.getTextInputValue('amount');

  const allItems = getAllItems(seller.id).filter(i => !i.is_category);
  const parsed   = [];

  for (const entry of rawItems.split(',').map(s => s.trim())) {
    if (!entry) continue;
    let name, qty;
    const colonMatch = entry.match(/^(.+):(\d+)$/);
    const xMatch     = entry.match(/^(\d+)x(.+)$/i);
    if (colonMatch)  { name = colonMatch[1].trim(); qty = parseInt(colonMatch[2]); }
    else if (xMatch) { qty  = parseInt(xMatch[1]);  name = xMatch[2].trim(); }
    else continue;
    const item = allItems.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (item && qty > 0) parsed.push({ qty, item });
  }

  if (!parsed.length) {
    const names = allItems.map(i => i.name).join(', ');
    return interaction.editReply({
      content: `❌ Could not parse items.\nFormat: \`ItemName:qty, ItemName:qty\`\nAvailable: ${names || 'none'}`
    });
  }

  for (const { qty, item } of parsed) {
    updateItemQty(seller.id, item.id, -qty);
  }

  logPurchase(
    seller.id, discordId, 'manual-entry',
    parsed.map(({ qty, item }) => ({ id: item.id, name: item.name, qty })),
    amount, 'manual'
  );

  const events = require('../events.js');
  events.emit('updateShopEmbed', seller.id);

  const config = getSellerConfig(seller.id);

  // Purchase log channel
  if (config?.log_channel_id) {
    try {
      const logCh = await client.channels.fetch(config.log_channel_id);
      const embed = new EmbedBuilder()
        .setTitle('📋 Purchase log — Manual entry')
        .setColor(0xF59E0B)
        .addFields(
          { name: 'Discord ID', value: `<@${discordId}>`, inline: true },
          { name: 'Amount',     value: amount, inline: true },
          { name: 'Items',      value: parsed.map(({ qty, item }) => `${item.emoji || '•'} ${item.name} ×${qty}`).join('\n') },
        )
        .setTimestamp();
      await logCh.send({ embeds: [embed] });
    } catch (e) { console.error('[manual-log] log channel failed:', e.message); }
  }

  // Vouches channel
  if (config?.vouch_channel_id) {
    try {
      const vouchCh    = await client.channels.fetch(config.vouch_channel_id);
      const vouchEmbed = new EmbedBuilder()
        .setTitle('⭐ New vouch')
        .setColor(0x7C3AED)
        .addFields(
          { name: 'Buyer',  value: `<@${discordId}>`, inline: true },
          { name: 'Amount', value: amount, inline: true },
          { name: 'Items',  value: parsed.map(({ qty, item }) => `${item.emoji || '•'} ${item.name} ×${qty}`).join('\n') },
        )
        .setFooter({ text: '恵 ¦ Ebisu' })
        .setTimestamp();
      await vouchCh.send({ embeds: [vouchEmbed] });
    } catch (e) { console.error('[manual-log] vouch channel failed:', e.message); }
  }

  // Stock updates
  if (config?.stock_updates_channel_id) {
    try {
      const stockCh = await client.channels.fetch(config.stock_updates_channel_id);
      const updatedItems = getAllItems(seller.id);
      const soldOut = parsed
        .filter(({ item }) => {
          const updated = updatedItems.find(i => i.id === item.id);
          return updated && updated.quantity === 0;
        })
        .map(({ item }) => item.name);
      const lines = parsed.map(({ qty, item }) => `${item.emoji || '•'} **${item.name}** — ${qty} sold`);
      if (soldOut.length) lines.push(`\n❌ Now out of stock: ${soldOut.join(', ')}`);
      const ping = config.customer_role_id ? `<@&${config.customer_role_id}> ` : '';
      await stockCh.send({ content: `${ping}**Stock update!**\n${lines.join('\n')}` });
    } catch (e) { console.error('[manual-log] stock notification failed:', e.message); }
  }

  await interaction.editReply({
    content: `✅ Manual log saved for <@${discordId}>.\nItems: ${parsed.map(({ qty, item }) => `${item.name} ×${qty}`).join(', ')}\nVouch posted to vouches channel.`
  });
}

module.exports = { showModal, handleManualLog };