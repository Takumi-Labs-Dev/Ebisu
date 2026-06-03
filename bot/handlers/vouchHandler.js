const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder
} = require('discord.js');
const { getAllItems, updateItemQty, logPurchase, getSellerConfig } = require('../db/index.js');

const dealCache = new Map();

// ── Parse "Fritz:1, Kengo:2" ─────────────────────────────────────────────────
function parseItemsByName(rawItems, allItems) {
  const parsed = [];
  for (const entry of rawItems.split(',').map(s => s.trim())) {
    if (!entry) continue;
    let name, qty;
    const colonMatch = entry.match(/^(.+):(\d+)$/);
    const xMatch     = entry.match(/^(\d+)x(.+)$/i);
    if (colonMatch)      { name = colonMatch[1].trim(); qty = parseInt(colonMatch[2]); }
    else if (xMatch)     { qty  = parseInt(xMatch[1]);  name = xMatch[2].trim(); }
    else continue;
    const item = allItems.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (item && qty > 0) parsed.push({ qty, item });
  }
  return parsed;
}

// ── Seller: show fill deal modal ──────────────────────────────────────────────
async function showFillDealModal(interaction, seller) {
  const items = getAllItems(seller.id).filter(i => !i.is_category);

  const modal = new ModalBuilder()
    .setCustomId(`fill_deal_modal_${seller.id}`)
    .setTitle('Fill deal info');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items_bought')
        .setLabel('Items sold (Name:qty, Name:qty)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`e.g. ${items[0]?.name ?? 'ItemName'}:1, ${items[1]?.name ?? 'ItemName'}:2`)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount_paid')
        .setLabel('Amount paid')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. $20 or 100 robux')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Note (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

// ── Seller: save deal to cache ────────────────────────────────────────────────
async function saveDealInfo(interaction, seller) {
  const rawItems = interaction.fields.getTextInputValue('items_bought');
  const amount   = interaction.fields.getTextInputValue('amount_paid');
  const note     = interaction.fields.getTextInputValue('note') || '';

  const allItems = getAllItems(seller.id).filter(i => !i.is_category);
  const parsed   = parseItemsByName(rawItems, allItems);

  if (!parsed.length) {
    const names = allItems.map(i => i.name).join(', ');
    return interaction.reply({
      content: `❌ Could not parse items.\nFormat: \`ItemName:qty, ItemName:qty\`\nAvailable: ${names || 'none'}`,
      ephemeral: true
    });
  }

  dealCache.set(interaction.channel.id, { parsed, amount, note });

  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Deal info filled')
    .setDescription(
      `The seller has filled in the deal details.\n` +
      `Review below then click **Submit vouch** to confirm.\n\n` +
      `**Items:**\n` +
      parsed.map(({ qty, item }) =>
        `${item.emoji || '•'} ${item.name} ×${qty}${item.price ? `  |  ${item.price}` : ''}`
      ).join('\n') +
      `\n\n**Amount paid:** ${amount}` +
      (note ? `\n**Note:** ${note}` : '')
    )
    .setColor(0x22c55e)
    .setFooter({ text: '恵 ¦ Ebisu' });

  await interaction.reply({ embeds: [confirmEmbed] });
}

// ── Client: show vouch modal (or auto-submit if prefilled) ────────────────────
async function showModal(interaction, seller) {
  const prefilled = dealCache.get(interaction.channel.id);
  if (prefilled) {
    // Deal already filled by seller — process immediately, no modal needed
    return handleSubmitWithData(
      interaction, null, seller,
      prefilled.parsed, prefilled.amount, prefilled.note
    );
  }

  const items = getAllItems(seller.id).filter(i => !i.is_category);

  const modal = new ModalBuilder()
    .setCustomId('vouch_modal')
    .setTitle('Submit your vouch');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items_bought')
        .setLabel('Items bought (Name:qty, Name:qty)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`e.g. ${items[0]?.name ?? 'ItemName'}:1, ${items[1]?.name ?? 'ItemName'}:2`)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount_paid')
        .setLabel('Amount paid')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. $20 or 100 robux')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Note (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

// ── Client: modal submitted ───────────────────────────────────────────────────
async function handleSubmit(interaction, client, seller) {
  const rawItems = interaction.fields.getTextInputValue('items_bought');
  const amount   = interaction.fields.getTextInputValue('amount_paid');
  const note     = interaction.fields.getTextInputValue('note') || '';

  const allItems = getAllItems(seller.id).filter(i => !i.is_category);
  const parsed   = parseItemsByName(rawItems, allItems);

  if (!parsed.length) {
    const names = allItems.map(i => i.name).join(', ');
    return interaction.reply({
      content: `❌ Could not parse items.\nFormat: \`ItemName:qty, ItemName:qty\`\nAvailable: ${names || 'none'}`,
      ephemeral: true
    });
  }

  await handleSubmitWithData(interaction, client, seller, parsed, amount, note);
}

// ── Shared: process the vouch ─────────────────────────────────────────────────
// client can be null when called from showModal (prefilled path) —
// we use the event emitter for shop update and get client from events.js bot ref
async function handleSubmitWithData(interaction, client, seller, parsed, amount, note) {
  await interaction.deferReply({ ephemeral: false });

  dealCache.delete(interaction.channel.id);

  // Subtract stock
  for (const { qty, item } of parsed) {
    updateItemQty(seller.id, item.id, -qty);
  }

  // Log purchase
  logPurchase(
    seller.id,
    interaction.user.id,
    interaction.user.tag,
    parsed.map(({ qty, item }) => ({ id: item.id, name: item.name, qty })),
    amount, 'auto', interaction.channel.id
  );

  // Update shop embed via event (works whether client is passed or not)
  const events = require('../events.js');
  events.emit('updateShopEmbed', seller.id);

  // Get the bot client — either passed in or retrieved from the singleton
  const botClient = client || require('../index.js');

  const config       = getSellerConfig(seller.id);
  const updatedItems = getAllItems(seller.id);

  const soldOut = parsed
    .filter(({ item }) => {
      const updated = updatedItems.find(i => i.id === item.id);
      return updated && updated.quantity === 0;
    })
    .map(({ item }) => item.name);

  // Stock updates channel
  if (config?.stock_updates_channel_id) {
    try {
      const stockCh = await botClient.channels.fetch(config.stock_updates_channel_id);
      const lines   = parsed.map(({ qty, item }) => `${item.emoji || '•'} **${item.name}** — ${qty} sold`);
      if (soldOut.length) lines.push(`\n❌ Now out of stock: ${soldOut.join(', ')}`);
      const ping = config.customer_role_id ? `<@&${config.customer_role_id}> ` : '';
      await stockCh.send({ content: `${ping}**Stock update!**\n${lines.join('\n')}` });
    } catch (e) { console.error('[vouch] stock notification failed:', e.message); }
  }

  // Purchase log channel
  if (config?.log_channel_id) {
    try {
      const logCh    = await botClient.channels.fetch(config.log_channel_id);
      const logEmbed = new EmbedBuilder()
        .setTitle('📋 Purchase log — Auto vouch')
        .setColor(0x7C3AED)
        .addFields(
          { name: 'Buyer',  value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Amount', value: amount, inline: true },
          { name: 'Items',  value: parsed.map(({ qty, item }) => `${item.emoji || '•'} ${item.name} ×${qty}`).join('\n') },
          ...(note ? [{ name: 'Note', value: note }] : [])
        )
        .setTimestamp();
      await logCh.send({ embeds: [logEmbed] });
    } catch (e) { console.error('[vouch] log channel failed:', e.message); }
  }

  // Vouches channel
  if (config?.vouch_channel_id) {
    try {
      const vouchCh    = await botClient.channels.fetch(config.vouch_channel_id);
      const vouchEmbed = new EmbedBuilder()
        .setTitle('⭐ New vouch')
        .setColor(0x7C3AED)
        .addFields(
          { name: 'Buyer',  value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Amount', value: amount, inline: true },
          { name: 'Items',  value: parsed.map(({ qty, item }) => `${item.emoji || '•'} ${item.name} ×${qty}`).join('\n') },
          ...(note ? [{ name: 'Note', value: note }] : [])
        )
        .setFooter({ text: '恵 ¦ Ebisu' })
        .setTimestamp();
      await vouchCh.send({ embeds: [vouchEmbed] });
    } catch (e) { console.error('[vouch] vouch channel failed:', e.message); }
  }

  await interaction.editReply({ content: '✅ Vouch submitted. Thank you!' });
}

module.exports = { showModal, handleSubmit, showFillDealModal, saveDealInfo };