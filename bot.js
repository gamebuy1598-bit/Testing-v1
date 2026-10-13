// ═══════════════════════════════════════════════════════════
//  🛡️  GUARDIAN X - Ultimate Discord Management Bot
//  Single-file bot | Anti-Spam | Anti-Nuke | Full Moderation
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType,
    ActivityType, Collection, SlashCommandBuilder, REST, Routes,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder,
    TextInputBuilder, TextInputStyle, InteractionType
} = require('discord.js');

// ═══════════════════════════════════════════════════════════
//  CONFIG FROM .ENV
// ═══════════════════════════════════════════════════════════
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    botName: process.env.BOT_NAME || 'Guardian X',
    status: process.env.BOT_STATUS || 'online',
    activityType: process.env.BOT_ACTIVITY_TYPE || 'WATCHING',
    activityText: process.env.BOT_ACTIVITY_TEXT || 'Over Your Server 🛡️',
    activityUrl: process.env.BOT_ACTIVITY_URL || '',
    colors: {
        primary: parseInt(process.env.COLOR_PRIMARY || '5865F2', 16),
        success: parseInt(process.env.COLOR_SUCCESS || '57F287', 16),
        error: parseInt(process.env.COLOR_ERROR || 'ED4245', 16),
        warning: parseInt(process.env.COLOR_WARNING || 'FEE75C', 16),
        info: parseInt(process.env.COLOR_INFO || '00BFFF', 16),
    },
    antispam: {
        enabled: process.env.ANTISPAM_ENABLED === 'true',
        limit: parseInt(process.env.ANTISPAM_MESSAGE_LIMIT || '5'),
        window: parseInt(process.env.ANTISPAM_TIME_WINDOW || '5000'),
        timeout: parseInt(process.env.ANTISPAM_TIMEOUT_DURATION || '600000'),
        dupLimit: parseInt(process.env.ANTISPAM_DUPLICATE_LIMIT || '3'),
    },
    antinuke: {
        enabled: process.env.ANTINUKE_ENABLED === 'true',
        channelDelete: parseInt(process.env.ANTINUKE_CHANNEL_DELETE_LIMIT || '3'),
        roleDelete: parseInt(process.env.ANTINUKE_ROLE_DELETE_LIMIT || '3'),
        banLimit: parseInt(process.env.ANTINUKE_BAN_LIMIT || '3'),
        kickLimit: parseInt(process.env.ANTINUKE_KICK_LIMIT || '3'),
        webhookLimit: parseInt(process.env.ANTINUKE_WEBHOOK_LIMIT || '2'),
        window: parseInt(process.env.ANTINUKE_TIME_WINDOW || '10000'),
    },
    link: {
        enabled: process.env.LINK_PROTECTION_ENABLED === 'true',
        action: process.env.LINK_ACTION || 'delete',
        inviteEnabled: process.env.INVITE_PROTECTION_ENABLED === 'true',
        allowed: (process.env.ALLOWED_LINKS || '').split(',').filter(Boolean),
    },
    logChannel: process.env.LOG_CHANNEL_ID,
    modLogChannel: process.env.MOD_LOG_CHANNEL_ID,
    prefix: process.env.PREFIX || '!',
};

// ═══════════════════════════════════════════════════════════
//  CLIENT INIT
// ═══════════════════════════════════════════════════════════
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
});

// ═══════════════════════════════════════════════════════════
//  CACHES
// ═══════════════════════════════════════════════════════════
const spamCache = new Collection();
const nukeCache = new Collection();
const inviteCache = new Collection();
const snipes = new Collection();

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createEmbed(type = 'primary', title, description) {
    return new EmbedBuilder()
        .setColor(CONFIG.colors[type] || CONFIG.colors.primary)
        .setTitle(title || null)
        .setDescription(description || null)
        .setFooter({ text: `${CONFIG.botName} • ${new Date().toLocaleString()}`, iconURL: client.user?.displayAvatarURL() })
        .setTimestamp();
}

async function sendLog(guild, embed, modLog = false) {
    const channelId = modLog ? (CONFIG.modLogChannel || CONFIG.logChannel) : CONFIG.logChannel;
    if (!channelId) return;
    const ch = guild.channels.cache.get(channelId);
    if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

async function safeSend(channel, content) {
    try {
        return await channel.send(content);
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
//  ANTI-NUKE SYSTEM
// ═══════════════════════════════════════════════════════════
function trackNuke(guildId, userId, action) {
    const key = `${guildId}-${userId}-${action}`;
    const now = Date.now();
    let data = nukeCache.get(key) || [];
    data = data.filter((t) => now - t < CONFIG.antinuke.window);
    data.push(now);
    nukeCache.set(key, data);
    return data.length;
}

async function handleNuke(guild, userId, action, limit, reason) {
    const count = trackNuke(guild.id, userId, action);
    if (count >= limit) {
        // whitelist check — owner and bot itself are safe
        if (userId === guild.ownerId || userId === client.user.id) return;
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return;
            if (member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                member.id === guild.ownerId) return;

            // Remove dangerous perms and ban
            await member.roles.set([], 'Anti-Nuke: Dangerous activity').catch(() => {});
            await guild.members.ban(userId, { reason: `Anti-Nuke: ${reason}`, deleteMessageSeconds: 3600 }).catch(() => {});

            const embed = createEmbed('error', '🚨 ANTI-NUKE TRIGGERED',
                `**User:** <@${userId}> (\`${userId}\`)\n**Action:** ${reason}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:R>`);
            await sendLog(guild, embed, true);
        } catch (e) {}
    }
}

// ═══════════════════════════════════════════════════════════
//  EVENT: READY
// ═══════════════════════════════════════════════════════════
client.once('ready', async () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  ✅ ${CONFIG.botName} is ONLINE`.padEnd(46) + `║`);
    console.log(`║  🤖 Logged in as: ${client.user.tag}`.padEnd(46) + `║`);
    console.log(`║  🏠 Servers: ${client.guilds.cache.size}`.padEnd(46) + `║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);

    // Set custom status
    const activityTypes = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing,
        STREAMING: ActivityType.Streaming,
    };
    const activityOpts = {
        name: CONFIG.activityText,
        type: activityTypes[CONFIG.activityType] || ActivityType.Watching,
    };
    if (CONFIG.activityType === 'STREAMING' && CONFIG.activityUrl) activityOpts.url = CONFIG.activityUrl;

    client.user.setPresence({
        status: CONFIG.status,
        activities: [activityOpts],
    });

    // Register slash commands per guild (instant)
    await registerSlashCommands();
});

// ═══════════════════════════════════════════════════════════
//  SLASH COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════
async function registerSlashCommands() {
    const commands = [
        new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
        new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
        new SlashCommandBuilder().setName('serverinfo').setDescription('Show server info'),
        new SlashCommandBuilder().setName('userinfo').setDescription('Show user info')
            .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(false)),
        new SlashCommandBuilder().setName('avatar').setDescription('Show user avatar')
            .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(false)),

        // Moderation
        new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
        new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
            .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete messages days (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)),
        new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
            .addStringOption((o) => o.setName('user_id').setDescription('User ID').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
        new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
        new SlashCommandBuilder().setName('untimeout').setDescription('Remove timeout')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
        new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)),
        new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages')
            .addIntegerOption((o) => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
        new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode')
            .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds (0 = off)').setRequired(true).setMinValue(0).setMaxValue(21600)),
        new SlashCommandBuilder().setName('lock').setDescription('Lock current channel'),
        new SlashCommandBuilder().setName('unlock').setDescription('Unlock current channel'),
        new SlashCommandBuilder().setName('nickname').setDescription('Change member nickname')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addStringOption((o) => o.setName('nickname').setDescription('New nickname').setRequired(false)),
        new SlashCommandBuilder().setName('role').setDescription('Add/remove role')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
            .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
            .addStringOption((o) => o.setName('action').setDescription('add/remove').setRequired(true)
                .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' })),
        new SlashCommandBuilder().setName('snipe').setDescription('Show last deleted message'),
        new SlashCommandBuilder().setName('clearwarns').setDescription('Clear all warns of a user')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
        new SlashCommandBuilder().setName('warnings').setDescription('Show warnings of a user')
            .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),

        // Anti-nuke controls
        new SlashCommandBuilder().setName('antinuke').setDescription('Toggle anti-nuke')
            .addStringOption((o) => o.setName('state').setDescription('on/off').setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
        new SlashCommandBuilder().setName('antispam').setDescription('Toggle anti-spam')
            .addStringOption((o) => o.setName('state').setDescription('on/off').setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
        new SlashCommandBuilder().setName('antilink').setDescription('Toggle anti-link')
            .addStringOption((o) => o.setName('state').setDescription('on/off').setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
    ].map((c) => c.toJSON());

    try {
        const rest = new REST({ version: '10' }).setToken(CONFIG.token);
        if (CONFIG.guildId) {
            await rest.put(Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId), { body: commands });
            console.log(`✅ Registered ${commands.length} slash commands in guild ${CONFIG.guildId}`);
        } else {
            await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands });
            console.log(`✅ Registered ${commands.length} global slash commands`);
        }
    } catch (e) {
        console.error('❌ Failed to register commands:', e);
    }
}

// ═══════════════════════════════════════════════════════════
//  WARN STORAGE (in-memory; reboot clears)
// ═══════════════════════════════════════════════════════════
const warns = new Collection();

// ═══════════════════════════════════════════════════════════
//  LINK / INVITE DETECTION
// ═══════════════════════════════════════════════════════════
const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/gi;

function containsLink(content) {
    linkRegex.lastIndex = 0;
    inviteRegex.lastIndex = 0;
    if (CONFIG.link.inviteEnabled && inviteRegex.test(content)) return true;
    if (CONFIG.link.enabled && linkRegex.test(content)) {
        // check whitelist
        const matches = content.match(linkRegex) || [];
        for (const m of matches) {
            if (!CONFIG.link.allowed.some((a) => m.includes(a))) return true;
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════════════
//  EVENT: MESSAGE CREATE — Anti-Spam + Anti-Link
// ═══════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    // skip if user has ManageMessages perm
    const isMod = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    // ── ANTI-LINK ──
    if (!isMod && containsLink(message.content)) {
        try {
            await message.delete().catch(() => {});
            const warn = await safeSend(message.channel,
                `⚠️ ${message.author}, links/invites are not allowed here!`);
            if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);

            const embed = createEmbed('warning', '🔗 Link Blocked',
                `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Content:** \`${message.content.slice(0, 200)}\``);
            await sendLog(message.guild, embed, true);
        } catch {}
        return;
    }

    // ── ANTI-SPAM ──
    if (CONFIG.antispam.enabled && !isMod) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        let data = spamCache.get(key) || { timestamps: [], messages: [] };

        // timestamp window
        data.timestamps = data.timestamps.filter((t) => now - t < CONFIG.antispam.window);
        data.timestamps.push(now);

        // duplicate tracking
        data.messages = data.messages.filter((m) => now - m.time < CONFIG.antispam.window);
        data.messages.push({ content: message.content.toLowerCase(), time: now });

        const dupCount = data.messages.filter((m) => m.content === message.content.toLowerCase()).length;

        spamCache.set(key, data);

        const triggered = data.timestamps.length > CONFIG.antispam.limit || dupCount >= CONFIG.antispam.dupLimit;

        if (triggered) {
            try {
                await message.member.timeout(CONFIG.antispam.timeout, 'Anti-Spam: Automatic timeout').catch(() => {});
                // delete recent messages
                const fetched = await message.channel.messages.fetch({ limit: 20 }).catch(() => null);
                if (fetched) {
                    const toDelete = fetched.filter((m) => m.author.id === message.author.id && Date.now() - m.createdTimestamp < CONFIG.antispam.window);
                    await message.channel.bulkDelete(toDelete, true).catch(() => {});
                }

                const embed = createEmbed('error', '🚫 Anti-Spam Triggered',
                    `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Timeout:** ${Math.round(CONFIG.antispam.timeout / 60000)} min\n**Reason:** Message flooding / duplicate spam`);
                await sendLog(message.guild, embed, true);

                const w = await safeSend(message.channel, `🚫 ${message.author} has been timed out for spamming.`);
                if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
            } catch {}
            spamCache.delete(key);
        }
    }

    // ── PREFIX COMMANDS (fallback for `!cmd`) ──
    if (!message.content.startsWith(CONFIG.prefix)) return;
    const args = message.content.slice(CONFIG.prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'ping') {
        const sent = await message.reply({ embeds: [createEmbed('info', '🏓 Pinging...', 'Calculating...')] });
        const latency = sent.createdTimestamp - message.createdTimestamp;
        sent.edit({ embeds: [createEmbed('success', '🏓 Pong!', `**Bot Latency:** \`${latency}ms\`\n**API Latency:** \`${Math.round(client.ws.ping)}ms\``)] });
    }
});

// ═══════════════════════════════════════════════════════════
//  EVENT: MESSAGE DELETE (for snipe)
// ═══════════════════════════════════════════════════════════
client.on('messageDelete', (message) => {
    if (!message.guild || message.author?.bot) return;
    snipes.set(message.channel.id, {
        content: message.content || '[No content]',
        author: message.author,
        timestamp: Date.now(),
        attachments: message.attachments.map((a) => a.url),
    });
});

// ═══════════════════════════════════════════════════════════
//  EVENT: CHANNEL DELETE — Anti-Nuke
// ═══════════════════════════════════════════════════════════
client.on('channelDelete', async (channel) => {
    if (!CONFIG.antinuke.enabled || !channel.guild) return;
    const guild = channel.guild;
    const logs = await guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.first();
    if (!entry) return;
    if (Date.now() - entry.createdTimestamp > 10000) return;
    await handleNuke(guild, entry.executor.id, 'channelDelete', CONFIG.antinuke.channelDelete, 'Mass channel deletion');
});

// ═══════════════════════════════════════════════════════════
//  EVENT: ROLE DELETE — Anti-Nuke
// ═══════════════════════════════════════════════════════════
client.on('roleDelete', async (role) => {
    if (!CONFIG.antinuke.enabled || !role.guild) return;
    const guild = role.guild;
    const logs = await guild.fetchAuditLogs({ type: 32, limit: 1 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.first();
    if (!entry) return;
    if (Date.now() - entry.createdTimestamp > 10000) return;
    await handleNuke(guild, entry.executor.id, 'roleDelete', CONFIG.antinuke.roleDelete, 'Mass role deletion');
});

// ═══════════════════════════════════════════════════════════
//  EVENT: BAN ADD — Anti-Nuke
// ═══════════════════════════════════════════════════════════
client.on('guildBanAdd', async (ban) => {
    if (!CONFIG.antinuke.enabled) return;
    const guild = ban.guild;
    const logs = await guild.fetchAuditLogs({ type: 22, limit: 1 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.first();
    if (!entry) return;
    if (Date.now() - entry.createdTimestamp > 10000) return;
    await handleNuke(guild, entry.executor.id, 'ban', CONFIG.antinuke.banLimit, 'Mass banning');
});

// ═══════════════════════════════════════════════════════════
//  EVENT: MEMBER REMOVE (KICK) — Anti-Nuke
// ═══════════════════════════════════════════════════════════
client.on('guildMemberRemove', async (member) => {
    if (!CONFIG.antinuke.enabled) return;
    const guild = member.guild;
    const logs = await guild.fetchAuditLogs({ type: 20, limit: 1 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.first();
    if (!entry) return;
    if (entry.target?.id !== member.id) return;
    if (Date.now() - entry.createdTimestamp > 10000) return;
    await handleNuke(guild, entry.executor.id, 'kick', CONFIG.antinuke.kickLimit, 'Mass kicking');
});

// ═══════════════════════════════════════════════════════════
//  EVENT: WEBHOOK UPDATE — Anti-Nuke
// ═══════════════════════════════════════════════════════════
client.on('webhooksUpdate', async (channel) => {
    if (!CONFIG.antinuke.enabled) return;
    const guild = channel.guild;
    const logs = await guild.fetchAuditLogs({ type: 50, limit: 1 }).catch(() => null);
    if (!logs) return;
    const entry = logs.entries.first();
    if (!entry) return;
    if (Date.now() - entry.createdTimestamp > 10000) return;
    await handleNuke(guild, entry.executor.id, 'webhook', CONFIG.antinuke.webhookLimit, 'Mass webhook creation');
});

// ═══════════════════════════════════════════════════════════
//  EVENT: GUILD MEMBER ADD — Welcome
// ═══════════════════════════════════════════════════════════
client.on('guildMemberAdd', async (member) => {
    if (process.env.WELCOME_CHANNEL_ID) {
        const ch = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
        if (ch) {
            const embed = createEmbed('success', `🎉 Welcome to ${member.guild.name}!`,
                `Hey ${member}, welcome to **${member.guild.name}**!\n\n**Member #${member.guild.memberCount}**\n**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }));
            ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }

    // Auto-role check for invite tracking
    if (CONFIG.logChannel) {
        const embed = createEmbed('info', '📥 Member Joined',
            `**User:** ${member.user.tag} (${member.id})\n**Account Age:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        sendLog(member.guild, embed);
    }
});

client.on('guildMemberRemove', async (member) => {
    if (CONFIG.logChannel) {
        const embed = createEmbed('warning', '📤 Member Left',
            `**User:** ${member.user.tag} (${member.id})`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        sendLog(member.guild, embed);
    }
});

// ═══════════════════════════════════════════════════════════
//  SLASH COMMAND HANDLER
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guild, member } = interaction;

    const reply = (embed) => interaction.reply({ embeds: [embed] }).catch(() => {});
    const replyEphemeral = (embed) => interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});

    const requireMod = () => {
        if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers) &&
            !member.permissions.has(PermissionsBitField.Flags.KickMembers) &&
            !member.permissions.has(PermissionsBitField.Flags.BanMembers) &&
            !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            replyEphemeral(createEmbed('error', '❌ Permission Denied', 'You lack moderation permissions.'));
            return false;
        }
        return true;
    };

    try {
        switch (commandName) {

            // ─────────── BASIC ───────────
            case 'ping': {
                const sentAt = Date.now();
                await interaction.deferReply();
                const apiPing = Math.round(client.ws.ping);
                const botPing = Date.now() - sentAt;
                await interaction.editReply({ embeds: [createEmbed('success', '🏓 Pong!',
                    `**Bot Latency:** \`${botPing}ms\`\n**API Latency:** \`${apiPing}ms\`\n**Uptime:** <t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`)] });
                break;
            }

            case 'help': {
                const embed = createEmbed('primary', `📖 ${CONFIG.botName} — Help Menu`,
                    `**Prefix:** \`${CONFIG.prefix}\` | **Slash commands supported**\n\n` +
                    `### 🛡️ Protection Systems\n` +
                    `> \`antispam\` • \`antinuke\` • \`antilink\`\n\n` +
                    `### 🔨 Moderation\n` +
                    `> \`kick\` • \`ban\` • \`unban\` • \`timeout\` • \`untimeout\` • \`warn\`\n` +
                    `> \`warnings\` • \`clearwarns\` • \`purge\` • \`slowmode\` • \`lock\` • \`unlock\`\n` +
                    `> \`nickname\` • \`role\` • \`snipe\`\n\n` +
                    `### ℹ️ Info\n` +
                    `> \`ping\` • \`serverinfo\` • \`userinfo\` • \`avatar\` • \`help\``)
                    .setThumbnail(client.user.displayAvatarURL());
                await reply(embed);
                break;
            }

            case 'serverinfo': {
                const g = interaction.guild;
                const embed = createEmbed('info', `🏠 ${g.name}`,
                    `**Owner:** <@${g.ownerId}>\n` +
                   
