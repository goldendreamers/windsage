import { ChannelType, SlashCommandBuilder } from "discord.js";

export function askCommand() {
  return new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask a Windsage question, or open the help buttons")
    .addStringOption((o) =>
      o
        .setName("question")
        .setDescription("Type a question (or skip and tap a topic)")
        .setRequired(false)
        .setMaxLength(200)
    );
}

export function modCommand() {
  return new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderator chores in #mod-bot (Confirm required)")
    .addSubcommand((s) =>
      s.setName("post-rules").setDescription("Post the frozen rules file into #rules")
    )
    .addSubcommand((s) =>
      s
        .setName("create-channel")
        .setDescription("Create a text channel in an allowed category")
        .addStringOption((o) =>
          o.setName("name").setDescription("Channel name").setRequired(true).setMaxLength(80)
        )
        .addChannelOption((o) =>
          o
            .setName("category")
            .setDescription("Allowed category")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("rename")
        .setDescription("Rename a text channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to rename")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("New name").setRequired(true).setMaxLength(80)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("topic")
        .setDescription("Set a channel topic")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("text").setDescription("Topic").setRequired(true).setMaxLength(1024)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("slowmode")
        .setDescription("Set slowmode seconds (0 to clear)")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o
            .setName("seconds")
            .setDescription("0–21600")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(21600)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("delete-channel")
        .setDescription("Delete a text channel (not the three protected ones)")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to delete")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("add-emoji")
        .setDescription("Add a custom emoji from an attached image")
        .addStringOption((o) =>
          o.setName("name").setDescription("emoji_name").setRequired(true).setMaxLength(32)
        )
        .addAttachmentOption((o) =>
          o.setName("image").setDescription("png/jpg/gif from this chat").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("remove-emoji")
        .setDescription("Remove a custom emoji by name")
        .addStringOption((o) =>
          o.setName("name").setDescription("emoji name").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("role-give")
        .setDescription("Give a cosmetic role")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Cosmetic role").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("role-take")
        .setDescription("Take a cosmetic role")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Cosmetic role").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("timeout")
        .setDescription("Timeout a member (minutes)")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("minutes")
            .setDescription("1–40320 (28d)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("kick")
        .setDescription("Kick a member")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setMaxLength(200))
    )
    .addSubcommand((s) =>
      s
        .setName("ban")
        .setDescription("Ban a member")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setMaxLength(200))
    );
}
