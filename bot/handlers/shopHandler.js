const { EmbedBuilder } = require('discord.js');
const { getAllItems, getSellerConfig, setShopMessageId } = require('../db/index.js');

function buildShopEmbed(seller) {
  const items = getAllItems(seller.seller_id || seller.id);

  if (!items.length) {
    return new EmbedBuilder()
      .setTitle('✦ 恵 ¦ Ebisu — Shop')
      .setDescription('Open a purchase ticket to buy. Stock updates automatically after each deal.\n\n*No items listed yet.*')
      .setColor(0x7C3AED)
      .setFooter({ text: `Last updated · ${new Date().toUTCString()}` });
  }

  const realItems = items.filter(i => !i.is_category);
  const maxName   = Math.max(...realItems.map(i => (i.name  || '').length), 4);
  const maxPrice  = Math.max(...realItems.map(i => (i.price || '—').length), 5);

  const lines = ['Open a purchase ticket to buy.\n'];

  for (const item of items) {
    if (item.is_category) {
      lines.push(`\n**— ${item.name} —**`);
      continue;
    }
    const emoji  = item.emoji || '•';
    const name   = (item.name  || '').padEnd(maxName);
    const price  = (item.price || '—').padEnd(maxPrice);
    const status = item.quantity === 0
      ? '❌ Out of stock'
      : `✅ ${item.quantity} in stock`;
    lines.push(`${emoji}  \`${name}\`  \`${price}\`  ${status}`);
  }

  return new EmbedBuilder()
    .setTitle('✦ 恵 ¦ Ebisu — Shop')
    .setDescription(lines.join('\n'))
    .setColor(0x7C3AED)
    .setFooter({ text: `Last updated · ${new Date().toUTCString()}` });
}

// Get client — either passed directly or from the bot singleton
function getClient(client) {
  if (client) return client;
  return require('../index.js');
}

async function postShopEmbed(clientArg, seller) {
  const client = getClient(clientArg);
  const config = getSellerConfig(seller.seller_id || seller.id);
  if (!config?.shop_channel_id) {
    console.warn(`[shop] seller ${seller.id} has no shop_channel_id set`);
    return;
  }
  try {
    const channel = await client.channels.fetch(config.shop_channel_id);
    const msg = await channel.send({ embeds: [buildShopEmbed(seller)] });
    setShopMessageId(seller.seller_id || seller.id, msg.id);
    console.log(`[shop] Posted embed for seller ${seller.id}, message ${msg.id}`);
  } catch (e) {
    console.error(`[shop] Failed to post embed for seller ${seller.id}:`, e.message);
  }
}

async function updateShopEmbed(clientArg, seller) {
  const client = getClient(clientArg);
  const config = getSellerConfig(seller.seller_id || seller.id);

  if (!config?.shop_channel_id) {
    console.warn(`[shop] seller ${seller.id} has no shop_channel_id — skipping`);
    return;
  }

  // If no message ID saved yet, post fresh instead of trying to edit
  if (!config?.shop_message_id) {
    console.warn(`[shop] seller ${seller.id} has no shop_message_id — posting fresh`);
    return postShopEmbed(client, seller);
  }

  try {
    const channel = await client.channels.fetch(config.shop_channel_id);
    const msg     = await channel.messages.fetch(config.shop_message_id);
    await msg.edit({ embeds: [buildShopEmbed(seller)] });
  } catch (e) {
    if (e.message.includes('Unknown Message')) {
      // Message was deleted — post fresh and save new ID
      console.warn(`[shop] Embed message deleted for seller ${seller.id} — reposting`);
      return postShopEmbed(client, seller);
    }
    console.error(`[shop] Failed to update embed for seller ${seller.id}:`, e.message);
  }
}

module.exports = { buildShopEmbed, postShopEmbed, updateShopEmbed };