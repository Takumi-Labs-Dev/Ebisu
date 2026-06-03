const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits
} = require('discord.js');
const { getOpenTicket, openTicket, closeTicket, getSellerConfig } = require('../db/index.js');

async function postPanel(interaction, seller) {
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

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Ticket panel posted.', ephemeral: true });
}

async function handleOpen(interaction, seller) {
  const userId = interaction.user.id;
  const guild  = interaction.guild;
  const config = getSellerConfig(seller.id);

  // Check DB for open ticket
  const existing = getOpenTicket(seller.id, userId);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channel_id);
    return interaction.reply({
      content: `You already have an open ticket: ${ch ? ch.toString() : 'check your channels'}.`,
      ephemeral: true
    });
  }

  // Double-check: look for an existing channel with this user's name in the category
  // This catches cases where the DB is out of sync
  const existingChannel = guild.channels.cache.find(
    ch => ch.parentId === config.ticket_category_id &&
          ch.name === `ticket-${interaction.user.username.toLowerCase()}`
  );
  if (existingChannel) {
    return interaction.reply({
      content: `You already have an open ticket: ${existingChannel.toString()}.`,
      ephemeral: true
    });
  }

  const type = interaction.customId.includes('purchase') ? 'purchase' : 'support';

  // Defer the reply immediately to prevent double-firing
  await interaction.deferReply({ ephemeral: true });

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: config.ticket_category_id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
    ]
  });

  openTicket(seller.id, userId, channel.id);

  // Client-facing embed + buttons
  const clientRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('submit_vouch')
      .setLabel('Submit vouch').setEmoji('⭐').setStyle(ButtonStyle.Success),
  );

  const ticketEmbed = new EmbedBuilder()
    .setTitle(type === 'purchase' ? '🛒 Purchase ticket' : '❓ Support ticket')
    .setDescription(
      `Hello <@${userId}>, staff will be with you shortly.\n` +
      `Once your deal is complete, click **Submit vouch** to confirm your purchase.\n\n` +
      `*The seller will fill in the deal details before you submit.*`
    )
    .setColor(0x7C3AED)
    .setFooter({ text: '恵 ¦ Ebisu' });

  await channel.send({ embeds: [ticketEmbed], components: [clientRow] });

  // Seller-only prompt
  const sellerRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fill_deal_${seller.id}`)
      .setLabel('Fill deal info').setEmoji('📝').setStyle(ButtonStyle.Primary),
  );

  const sellerEmbed = new EmbedBuilder()
    .setTitle('📝 Seller — Fill deal info')
    .setDescription(
      `Use the button below to fill in what was sold.\n` +
      `This pre-fills the vouch so the client just needs to confirm and submit.`
    )
    .setColor(0x4F46E5)
    .setFooter({ text: 'Only visible to the seller' });

  await channel.send({ embeds: [sellerEmbed], components: [sellerRow] });

  await interaction.editReply({ content: `Your ticket: ${channel.toString()}` });
}

async function handleClose(interaction) {
  closeTicket(interaction.channel.id);
  await interaction.reply({ content: '🔒 Ticket closed. Deleting in 5 seconds...' });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

module.exports = { postPanel, handleOpen, handleClose };