import {
  Client,
  GatewayIntentBits,
  Options,
  REST,
  Routes,
} from "discord.js";
import { handleAsk, handleChannelQuestion } from "./ask.mjs";
import { askCommand, modCommand } from "./commands.mjs";
import { loadConfig } from "./config.mjs";
import { isModMember, offerConfirm, onConfirmButton, planMod } from "./mod.mjs";
import { handleTreeInteraction, isTreeCustomId } from "./tree.mjs";
import {
  briutCommand,
  handleBriut,
  handleLaan,
  handleRuach,
  laanCommand,
  ruachCommand,
} from "./wind-commands.mjs";

const cfg = loadConfig();
if (cfg.missing.length) {
  console.error(
    `windsage-helper: missing ${cfg.missing.join(", ")} in helper.env — not starting.`
  );
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
    GuildMemberManager: 80,
  }),
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(cfg.token);
  await rest.put(Routes.applicationGuildCommands(cfg.clientId, cfg.guildId), {
    body: [
      askCommand().toJSON(),
      ruachCommand().toJSON(),
      laanCommand().toJSON(),
      briutCommand().toJSON(),
      modCommand().toJSON(),
    ],
  });
}

client.once("ready", async () => {
  console.log(`windsage-helper: ready as ${client.user.tag} (no Message Content intent)`);
  try {
    await registerCommands();
    console.log("windsage-helper: registered /ask /ruach /laan /briut /mod for the guild");
  } catch (err) {
    console.error("windsage-helper: command register failed", err);
  }
  try {
    await client.user.setPresence({
      activities: [{ name: "/ruach · /laan · /ask" }],
      status: "online",
    });
  } catch {
    /* ignore */
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      if (isTreeCustomId(interaction.customId)) {
        await handleTreeInteraction(interaction);
        return;
      }
      if (interaction.isButton()) {
        await onConfirmButton(cfg, interaction);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ask") {
      await handleAsk(cfg, interaction);
      return;
    }

    if (interaction.commandName === "ruach") {
      await handleRuach(cfg, interaction);
      return;
    }
    if (interaction.commandName === "laan") {
      await handleLaan(cfg, interaction);
      return;
    }
    if (interaction.commandName === "briut") {
      await handleBriut(cfg, interaction);
      return;
    }

    if (interaction.commandName === "mod") {
      if (interaction.guildId !== cfg.guildId) {
        await interaction.reply({ content: "Guild only.", ephemeral: true });
        return;
      }
      if (!cfg.modChannelId) {
        await interaction.reply({
          content: "#mod-bot is not configured. Feature off.",
          ephemeral: true,
        });
        return;
      }
      if (interaction.channelId !== cfg.modChannelId) {
        await interaction.reply({ content: "Use /mod in #moderator-only.", ephemeral: true });
        return;
      }
      if (!isModMember(cfg, interaction.member)) {
        await interaction.reply({ content: "Mods only.", ephemeral: true });
        return;
      }
      const planned = await planMod(cfg, interaction);
      if (planned.error) {
        await interaction.reply({ content: planned.error, ephemeral: true });
        return;
      }
      await offerConfirm(cfg, interaction, planned);
    }
  } catch (err) {
    console.error("windsage-helper: interaction failed", err);
    try {
      const msg = "That failed. Ask a human mod.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch {
      /* ignore */
    }
  }
});

client.login(cfg.token);

client.on("messageCreate", async (message) => {
  try {
    await handleChannelQuestion(cfg, message, client.user?.id);
  } catch (err) {
    console.error("windsage-helper: message failed", err);
  }
});
