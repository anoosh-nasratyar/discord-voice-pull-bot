const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();


// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Initialize SQLite database
const db = new sqlite3.Database('./voice_pulls.db');

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS pull_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puller_id TEXT NOT NULL,
        pulled_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        original_channel_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Bot configuration
const PREFIX = '.';
const BOT_TOKEN = process.env.BOT_TOKEN;
// Helper function to get user's voice channel
function getUserVoiceChannel(guild, userId) {
    const member = guild.members.cache.get(userId);
    return member?.voice?.channel || null;
}

// Helper function to check pull relationship
function getPullRelationship(pullerId, pulledId, guildId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM pull_relationships WHERE puller_id = ? AND pulled_id = ? AND guild_id = ?',
            [pullerId, pulledId, guildId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

// Helper function to add pull relationship
function addPullRelationship(pullerId, pulledId, guildId, originalChannelId) {
    return new Promise((resolve, reject) => {
        // First, remove any existing relationships where this user was pulled by someone else
        db.run(
            'DELETE FROM pull_relationships WHERE pulled_id = ? AND guild_id = ?',
            [pulledId, guildId],
            (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Then add the new relationship
                db.run(
                    'INSERT INTO pull_relationships (puller_id, pulled_id, guild_id, original_channel_id) VALUES (?, ?, ?, ?)',
                    [pullerId, pulledId, guildId, originalChannelId],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            }
        );
    });
}

// Helper function to remove pull relationship
function removePullRelationship(pullerId, pulledId, guildId) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM pull_relationships WHERE puller_id = ? AND pulled_id = ? AND guild_id = ?',
            [pullerId, pulledId, guildId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

// Helper function to get original channel
function getOriginalChannel(pullerId, pulledId, guildId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT original_channel_id FROM pull_relationships WHERE puller_id = ? AND pulled_id = ? AND guild_id = ?',
            [pullerId, pulledId, guildId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row?.original_channel_id || null);
            }
        );
    });
}

client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args[0].toLowerCase();
    
    try {
        if (command === 'cek') {
            // Pull command
            if (args.length < 2) {
                return message.reply('Usage: `.cek @user`');
            }
            
            const targetUser = message.mentions.users.first();
            if (!targetUser) {
                return message.reply('Please mention a valid user!');
            }
            
            if (targetUser.id === message.author.id) {
                return message.reply('You cannot pull yourself!');
            }
            
            const pullerChannel = getUserVoiceChannel(message.guild, message.author.id);
            if (!pullerChannel) {
                return message.reply('You must be in a voice channel to pull someone!');
            }
            
            const targetChannel = getUserVoiceChannel(message.guild, targetUser.id);
            if (!targetChannel) {
                return message.reply(`${targetUser.username} is not in a voice channel!`);
            }
            
            if (targetChannel.id === pullerChannel.id) {
                return message.reply(`${targetUser.username} is already in your voice channel!`);
            }
            
            // Create confirmation embed and button
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Voice Channel Pull Request')
                .setDescription(`${message.author.username} wants to pull you to **${pullerChannel.name}**`)
                .addFields(
                    { name: 'From', value: targetChannel.name, inline: true },
                    { name: 'To', value: pullerChannel.name, inline: true }
                )
                .setTimestamp();
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_pull_${message.author.id}_${targetUser.id}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`decline_pull_${message.author.id}_${targetUser.id}`)
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await message.reply({
                content: `${targetUser}, you have a pull request!`,
                embeds: [embed],
                components: [row]
            });
            
        } else if (command === 'at') {
            // Kick command
            if (args.length < 2) {
                return message.reply('Usage: `.at @user`');
            }
            
            const targetUser = message.mentions.users.first();
            if (!targetUser) {
                return message.reply('Please mention a valid user!');
            }
            
            // Check if the message author has permission to kick this user
            const relationship = await getPullRelationship(message.author.id, targetUser.id, message.guild.id);
            if (!relationship) {
                return message.reply('You can only kick users that you have pulled!');
            }
            
            const targetMember = message.guild.members.cache.get(targetUser.id);
            if (!targetMember?.voice?.channel) {
                return message.reply(`${targetUser.username} is not in a voice channel!`);
            }
            
            // Get original channel
            const originalChannelId = relationship.original_channel_id;
            const originalChannel = message.guild.channels.cache.get(originalChannelId);
            
            if (!originalChannel) {
                return message.reply('Original channel no longer exists!');
            }
            
            try {
                await targetMember.voice.setChannel(originalChannel);
                await removePullRelationship(message.author.id, targetUser.id, message.guild.id);
                
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('User Kicked Back')
                    .setDescription(`${targetUser.username} has been moved back to **${originalChannel.name}**`)
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
                
            } catch (error) {
                console.error('Error moving user:', error);
                message.reply('Failed to move the user. Please check bot permissions.');
            }
        }
        
    } catch (error) {
        console.error('Command error:', error);
        message.reply('An error occurred while processing your command.');
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const [action, type, pullerId, pulledId] = interaction.customId.split('_');
    
    if (action === 'accept' && type === 'pull') {
        // Only the target user can accept
        if (interaction.user.id !== pulledId) {
            return interaction.reply({ content: 'Only the mentioned user can accept this request!', ephemeral: true });
        }
        
        const puller = interaction.guild.members.cache.get(pullerId);
        const pulled = interaction.guild.members.cache.get(pulledId);
        
        if (!puller || !pulled) {
            return interaction.reply({ content: 'One of the users is no longer in the server!', ephemeral: true });
        }
        
        const pullerChannel = puller.voice?.channel;
        const pulledChannel = pulled.voice?.channel;
        
        if (!pullerChannel) {
            return interaction.reply({ content: 'The person who requested the pull is no longer in a voice channel!', ephemeral: true });
        }
        
        if (!pulledChannel) {
            return interaction.reply({ content: 'You are no longer in a voice channel!', ephemeral: true });
        }
        
        try {
            // Store original channel and move user
            await addPullRelationship(pullerId, pulledId, interaction.guild.id, pulledChannel.id);
            await pulled.voice.setChannel(pullerChannel);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('Pull Request Accepted')
                .setDescription(`${pulled.user.username} has been moved to **${pullerChannel.name}**`)
                .setTimestamp();
            
            await interaction.update({
                embeds: [embed],
                components: []
            });
            
        } catch (error) {
            console.error('Error moving user:', error);
            interaction.reply({ content: 'Failed to move you. Please check bot permissions.', ephemeral: true });
        }
        
    } else if (action === 'decline' && type === 'pull') {
        // Only the target user can decline
        if (interaction.user.id !== pulledId) {
            return interaction.reply({ content: 'Only the mentioned user can decline this request!', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Pull Request Declined')
            .setDescription('The pull request has been declined.')
            .setTimestamp();
        
        await interaction.update({
            embeds: [embed],
            components: []
        });
    }
});

if (!BOT_TOKEN) {
    console.error('BOT_TOKEN is missing in .env');
    process.exit(1);
}

client.login(BOT_TOKEN);

// Clean up database when users leave voice channels
client.on('voiceStateUpdate', async (oldState, newState) => {
    // If user left voice completely, clean up any relationships where they were pulled
    if (oldState.channel && !newState.channel) {
        db.run(
            'DELETE FROM pull_relationships WHERE pulled_id = ? AND guild_id = ?',
            [newState.id, newState.guild.id],
            (err) => {
                if (err) console.error('Error cleaning up relationships:', err);
            }
        );
    }
});

// Login to Discord
client.login(BOT_TOKEN);