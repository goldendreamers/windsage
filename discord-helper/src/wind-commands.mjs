import { SlashCommandBuilder } from "discord.js";
import { fetchClubGlance, fetchClubWind, fetchHealth, formatWindLine } from "./club-api.mjs";

export function ruachCommand() {
  return new SlashCommandBuilder()
    .setName("ruach")
    .setNameLocalizations({ he: "רוח" })
    .setDescription("Live wind at a club spot (Windsage /v1, no LLM)")
    .setDescriptionLocalizations({ he: "רוח חיה בספוט של החבורה" })
    .addStringOption((o) =>
      o
        .setName("spot")
        .setNameLocalizations({ he: "ספוט" })
        .setDescription("פריגול / הרצליה / חיפה")
        .setRequired(true)
        .setMaxLength(80)
    );
}

export function laanCommand() {
  return new SlashCommandBuilder()
    .setName("laan")
    .setNameLocalizations({ he: "לאן" })
    .setDescription("Where to go — club glance from Windsage /v1")
    .setDescriptionLocalizations({ he: "לאן לצאת — מבט על ספוטי החבורה" });
}

export function briutCommand() {
  return new SlashCommandBuilder()
    .setName("briut")
    .setNameLocalizations({ he: "בריאות" })
    .setDescription("Windsage /health")
    .setDescriptionLocalizations({ he: "בריאות השרת" });
}

export async function handleRuach(cfg, interaction) {
  const spot = interaction.options.getString("spot")?.trim() || "";
  await interaction.deferReply();
  try {
    const row = await fetchClubWind(cfg, spot);
    await interaction.editReply({
      content: formatWindLine(row) + (row.windguruUrl ? `\n${row.windguruUrl}` : ""),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    const names = err?.body?.spots ? ` ספוטים: ${err.body.spots.join(", ")}` : "";
    await interaction.editReply({
      content: `לא מצאתי רוח ל«${spot}».${names}`,
      allowedMentions: { parse: [] },
    });
  }
}

export async function handleLaan(cfg, interaction) {
  await interaction.deferReply();
  try {
    const json = await fetchClubGlance(cfg);
    const lines = (json.rows || []).map(formatWindLine);
    await interaction.editReply({
      content: lines.length ? `לאן לצאת\n${lines.join("\n")}` : "אין קריאות עכשיו.",
      allowedMentions: { parse: [] },
    });
  } catch {
    await interaction.editReply({
      content: "לא הצלחתי לקרוא את /v1/club/glance.",
      allowedMentions: { parse: [] },
    });
  }
}

export async function handleBriut(cfg, interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const h = await fetchHealth(cfg);
    const push = h.webPush ? "פעמון דולק" : "פעמון כבוי";
    const hold = h.discordHold ? "וובהוק דולק" : "וובהוק כבוי";
    await interaction.editReply({
      content: `Windsage ${h.ok ? "חי" : "לא"}. ${push}. ${hold}. https://windsage.nimrod.bio/health`,
    });
  } catch {
    await interaction.editReply({ content: "https://windsage.nimrod.bio/health לא נענה." });
  }
}
