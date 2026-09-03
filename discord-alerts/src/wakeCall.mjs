/**
 * Wake-on-wind: private guild voice channel + looping siren.
 * Discord bots cannot start a DM “incoming call”, so this is the VC we can run.
 */
import { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const SAMPLE_RATE = 48_000;
const FLIP_SEC = 0.32;
const sessions = new Map();

export function createSirenPcmStream() {
  let t = 0;
  let high = true;
  let untilFlip = Math.floor(SAMPLE_RATE * FLIP_SEC);
  return new Readable({
    read(size) {
      const frames = Math.max(480, Math.floor(Number(size || 3840) / 4));
      const buf = Buffer.alloc(frames * 4);
      for (let i = 0; i < frames; i += 1) {
        const freq = high ? 880 : 587;
        const sample = Math.sin((2 * Math.PI * freq * t) / SAMPLE_RATE) * 0.22;
        const s = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
        buf.writeInt16LE(s, i * 4);
        buf.writeInt16LE(s, i * 4 + 2);
        t += 1;
        untilFlip -= 1;
        if (untilFlip <= 0) {
          high = !high;
          untilFlip = Math.floor(SAMPLE_RATE * FLIP_SEC);
        }
      }
      this.push(buf);
    },
  });
}

function playSiren(player) {
  const resource = createAudioResource(createSirenPcmStream(), {
    inputType: StreamType.Raw,
  });
  player.play(resource);
}

function channelName(discordUserId) {
  const id = String(discordUserId || '').replace(/\D/g, '').slice(-8) || 'wake';
  return `wake-${id}`.slice(0, 100);
}

async function ensureWakeChannel(guild, discordUserId, botId) {
  const name = channelName(discordUserId);
  const existing = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildVoice && ch.name === name,
  );
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: discordUserId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.CreateInstantInvite,
      ],
    },
  ];
  if (existing) {
    await existing.permissionOverwrites.set(overwrites).catch(() => undefined);
    return existing;
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    reason: 'Windsage wake-on-wind call',
    permissionOverwrites: overwrites,
  });
}

function destroySession(session) {
  if (!session) return;
  try {
    session.player?.stop(true);
  } catch {
    /* ignore */
  }
  try {
    session.connection?.destroy();
  } catch {
    /* ignore */
  }
  if (session.channel?.deletable) {
    void session.channel.delete('Windsage wake call stopped').catch(() => undefined);
  }
}

export async function stopWakeCall(discordUserId) {
  const id = String(discordUserId || '').trim();
  const session = sessions.get(id);
  if (!session) return { ok: true, stopped: false };
  sessions.delete(id);
  destroySession(session);
  return { ok: true, stopped: true };
}

export async function startWakeCall(client, cfg, { discordUserId, title, body }) {
  const id = String(discordUserId || '').trim();
  if (!id) return { ok: false, error: 'discordUserId required' };
  if (sessions.has(id)) {
    const live = sessions.get(id);
    return {
      ok: true,
      already: true,
      channelId: live.channel?.id || null,
      joinUrl: live.joinUrl || null,
    };
  }

  const guild = await client.guilds.fetch(cfg.guildId);
  await guild.channels.fetch();
  const channel = await ensureWakeChannel(guild, id, client.user.id);
  const joinUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 12_000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  player.on(AudioPlayerStatus.Idle, () => {
    if (sessions.get(id)?.player === player) playSiren(player);
  });
  playSiren(player);
  connection.subscribe(player);

  const session = { channel, connection, player, joinUrl };
  sessions.set(id, session);

  const headline = String(title || 'WAKE UP · Windsage').slice(0, 180);
  const detail = String(body || 'Wind is up').slice(0, 400);
  const content =
    `${headline}\n${detail}\nJoin the voice call: ${joinUrl}\nIt keeps ringing there until you tap Stop in Windsage.\nhttps://windsage.nimrod.bio/`.slice(
      0,
      1900,
    );
  try {
    const user = await client.users.fetch(id);
    await user.send({ content });
  } catch (err) {
    console.error('windsage-alerts: wake DM failed', err?.message || err);
  }

  return { ok: true, channelId: channel.id, joinUrl };
}

export function activeWakeCount() {
  return sessions.size;
}
