import { Client, GatewayIntentBits, Options, REST, Routes } from 'discord.js';
import { cloudPost, linkCommand, loadConfig, unlinkCommand } from './config.mjs';
import { startWakeHttp } from './http.mjs';

const cfg = loadConfig();
if (cfg.missing.length) {
  console.error(`windsage-alerts: missing ${cfg.missing.join(', ')} in alerts.env — not starting.`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
  }),
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(cfg.token);
  await rest.put(Routes.applicationGuildCommands(cfg.clientId, cfg.guildId), {
    body: [linkCommand().toJSON(), unlinkCommand().toJSON()],
  });
}

client.once('ready', async () => {
  console.log(`windsage-alerts: ready as ${client.user.tag}`);
  try {
    await registerCommands();
    console.log('windsage-alerts: registered /link /unlink');
  } catch (err) {
    console.error('windsage-alerts: command register failed', err);
  }
  try {
    await client.user.setPresence({
      activities: [{ name: 'Windsage alerts' }],
      status: 'online',
    });
  } catch {
    /* ignore */
  }
  startWakeHttp(client, cfg);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.guildId && interaction.guildId !== cfg.guildId) {
      await interaction.reply({ content: 'This bot is only for the Windsage server.', ephemeral: true });
      return;
    }
    if (interaction.commandName === 'link') {
      const code = interaction.options.getString('code', true);
      await interaction.deferReply({ ephemeral: true });
      const rec = await cloudPost(cfg, '/v1/internal/discord-alert/link', {
        code,
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
      });
      if (!rec.ok) {
        await interaction.editReply(rec.json?.error || 'Could not link. Generate a new code in Account.');
        return;
      }
      await interaction.editReply(
        'Linked. Station alerts can DM you. Wake-up uses a private voice call (plus one join DM). Keep DMs from server members on.',
      );
      return;
    }
    if (interaction.commandName === 'unlink') {
      await interaction.deferReply({ ephemeral: true });
      const rec = await cloudPost(cfg, '/v1/internal/discord-alert/unlink', {
        discordUserId: interaction.user.id,
      });
      if (!rec.ok) {
        await interaction.editReply(rec.json?.error || 'Could not unlink.');
        return;
      }
      await interaction.editReply('Discord alert DMs are off for this account.');
    }
  } catch (err) {
    console.error('windsage-alerts: interaction failed', err);
    try {
      const msg = 'That failed. Try again from Account.';
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } catch {
      /* ignore */
    }
  }
});

client.login(cfg.token);
