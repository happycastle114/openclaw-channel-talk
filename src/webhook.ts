import type { Server } from 'node:http';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ChannelTalkWebhookEvent } from './types.js';
import { createApiClient } from './api-client.js';
import { getChannelTalkRuntime } from './runtime.js';

const DEFAULT_ACCOUNT_ID = 'default';
const DEDUP_TTL_MS = 60_000;
const DEDUP_CLEANUP_INTERVAL_MS = 30_000;

/**
 * Check if a message mentions the bot.
 * Matches @botName or common patterns like "봇이름아", "봇이름아,", etc.
 * If no botName is configured, always returns false (falls through to respond to all).
 */
function checkMention(text: string, botName?: string): boolean {
  if (!botName) return false;
  const lower = text.toLowerCase();
  const nameLower = botName.toLowerCase();
  // Direct @mention
  if (lower.includes(`@${nameLower}`)) return true;
  // Name appears at start or as a word boundary
  const namePattern = new RegExp(`(?:^|\\s)${escapeRegex(nameLower)}(?:[아야,!?\\s]|$)`, 'i');
  if (namePattern.test(text)) return true;
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type StartChannelTalkWebhookContext = {
  cfg: OpenClawConfig;
  runtime: { log?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  abortSignal: AbortSignal;
  accountId?: string;
  setStatus?: (next: Record<string, unknown>) => void;
  log?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug?: (msg: string, meta?: Record<string, unknown>) => void;
  };
};

export type StartChannelTalkWebhookResult = {
  server: Server;
  shutdown: () => Promise<void>;
};

export async function startChannelTalkWebhook(
  ctx: StartChannelTalkWebhookContext,
): Promise<StartChannelTalkWebhookResult> {
  const core = getChannelTalkRuntime();
  const log = ctx.log ?? {
    info: (msg: string) => ctx.runtime.log?.(`[channel-talk] ${msg}`),
    warn: (msg: string) => ctx.runtime.log?.(`[channel-talk] WARN: ${msg}`),
    error: (msg: string) => ctx.runtime.error?.(`[channel-talk] ${msg}`),
    debug: (msg: string) => ctx.runtime.log?.(`[channel-talk] ${msg}`),
  };

  const channelTalkCfg = (ctx.cfg.channels as Record<string, Record<string, unknown>> | undefined)?.['channel-talk'];
  if (!channelTalkCfg) {
    log.error('channel-talk config not found');
    throw new Error('channel-talk config not found in cfg.channels');
  }

  const accessKey = channelTalkCfg.accessKey as string | undefined;
  const accessSecret = channelTalkCfg.accessSecret as string | undefined;
  if (!accessKey || !accessSecret) {
    log.error('channel-talk credentials not configured');
    throw new Error('channel-talk credentials (accessKey, accessSecret) not configured');
  }

  const webhookCfg = channelTalkCfg.webhook as { port?: number; path?: string } | undefined;
  const port = webhookCfg?.port ?? 3979;
  const webhookPath = webhookCfg?.path ?? '/api/channel-talk';
  const botName = channelTalkCfg.botName as string | undefined;
  const accountId = ctx.accountId ?? DEFAULT_ACCOUNT_ID;
  const allowedGroups = channelTalkCfg.allowedGroups as string[] | undefined;
  const mentionOnly = channelTalkCfg.mentionOnly as boolean | undefined;

  const apiClient = createApiClient({ accessKey, accessSecret }, channelTalkCfg.baseUrl as string | undefined);

  const dedupCache = new Map<string, number>();

  const cleanupDedup = () => {
    const now = Date.now();
    for (const [key, ts] of dedupCache) {
      if (now - ts > DEDUP_TTL_MS) {
        dedupCache.delete(key);
      }
    }
  };

  const dedupTimer = setInterval(cleanupDedup, DEDUP_CLEANUP_INTERVAL_MS);
  (dedupTimer as unknown as { unref?: () => void }).unref?.();

  const isDuplicate = (messageId: string): boolean => {
    if (dedupCache.has(messageId)) {
      return true;
    }
    dedupCache.set(messageId, Date.now());
    return false;
  };

  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  app.post(webhookPath, (req: { body: unknown }, res: { status: (code: number) => { json: (data: unknown) => void } }) => {
    res.status(200).json({ ok: true });

    const body = req.body as ChannelTalkWebhookEvent | undefined;
    if (!body) {
      log.debug?.('empty webhook body');
      return;
    }

    // Debug: log raw incoming payload structure
    log.info('webhook received', {
      isArray: Array.isArray(body),
      keys: Array.isArray(body) ? 'array' : Object.keys(body as Record<string, unknown>),
    });

    // Unwrap payload: n8n sends [{ body: { event, entity, ... } }]
    let raw: Record<string, unknown> = body as Record<string, unknown>;
    if (Array.isArray(body)) {
      raw = (body[0] ?? {}) as Record<string, unknown>;
    }
    // If the actual event is nested inside a 'body' field (n8n webhook proxy pattern)
    if (!raw.event && raw.body && typeof raw.body === 'object') {
      raw = raw.body as Record<string, unknown>;
    }

    const unwrapped = raw as unknown as ChannelTalkWebhookEvent;

    void handleWebhookEvent(unwrapped).catch((err: unknown) => {
      log.error('webhook handler error', { error: String(err) });
    });
  });

  async function handleWebhookEvent(event: ChannelTalkWebhookEvent): Promise<void> {
    const isTeamChatMessage =
      event.event === 'push' ||
      event.type === 'message.created.teamChat';

    if (!isTeamChatMessage) {
      log.debug?.('skipping non-message event', {
        event: event.event,
        type: event.type,
      });
      return;
    }

    const entity = event.entity;
    if (!entity) {
      log.debug?.('skipping event without entity');
      return;
    }

    if (entity.chatType !== 'group') {
      log.debug?.('skipping non-group message', { chatType: entity.chatType });
      return;
    }

    if (entity.personType === 'bot') {
      log.debug?.('skipping bot message');
      return;
    }

    const messageId = entity.id;
    if (!messageId) {
      log.debug?.('skipping message without id');
      return;
    }
    if (isDuplicate(messageId)) {
      log.debug?.('skipping duplicate message', { messageId });
      return;
    }

    const plainText = entity.plainText?.trim() ?? '';
    if (!plainText) {
      log.debug?.('skipping empty message');
      return;
    }

    const refers = event.refers;
    const groupId = entity.chatId ?? refers?.group?.id;
    if (!groupId) {
      log.debug?.('skipping message without group id');
      return;
    }

    // --- Group allowlist filtering ---
    if (allowedGroups && allowedGroups.length > 0) {
      if (!allowedGroups.includes(groupId)) {
        log.debug?.('skipping message from non-allowed group', { groupId });
        return;
      }
    }

    // --- Mention-only filtering ---
    const wasMentioned = mentionOnly
      ? checkMention(plainText, botName)
      : false;

    if (mentionOnly && !wasMentioned) {
      log.debug?.('skipping non-mentioned message (mentionOnly=true)', { groupId });
      return;
    }

    const managerId = refers?.manager?.id ?? entity.personId ?? 'unknown';
    const managerName = refers?.manager?.name ?? managerId;
    const timestamp = entity.createdAt ?? Date.now();

    log.info('received team chat message', {
      messageId,
      groupId,
      from: managerName,
      preview: plainText.slice(0, 80),
    });

    const route = core.channel.routing.resolveAgentRoute({
      cfg: ctx.cfg,
      channel: 'channel-talk',
      peer: {
        kind: 'group' as const,
        id: groupId,
      },
    });

    const storePath = core.channel.session.resolveStorePath(ctx.cfg.session?.store, {
      agentId: route.agentId,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(ctx.cfg);
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    });

    const formattedBody = core.channel.reply.formatAgentEnvelope({
      channel: 'Channel Talk',
      from: managerName,
      timestamp: new Date(timestamp),
      previousTimestamp,
      envelope: envelopeOptions,
      body: plainText,
    });

    const preview = plainText.replace(/\s+/g, ' ').slice(0, 160);
    core.system.enqueueSystemEvent(
      `Channel Talk message from ${managerName}: ${preview}`,
      {
        sessionKey: route.sessionKey,
        contextKey: `channel-talk:message:${groupId}:${messageId}`,
      },
    );

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: formattedBody,
      RawBody: plainText,
      CommandBody: plainText,
      From: `channel-talk:${managerId}`,
      To: `group:${groupId}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId ?? accountId,
      ChatType: 'channel' as const,
      ConversationLabel: managerName,
      SenderName: managerName,
      SenderId: managerId,
      Provider: 'channel-talk' as const,
      Surface: 'channel-talk' as const,
      MessageSid: messageId,
      Timestamp: timestamp,
      WasMentioned: wasMentioned || !mentionOnly,
      CommandAuthorized: false,
      OriginatingChannel: 'channel-talk' as const,
      OriginatingTo: `group:${groupId}`,
    });

    await core.channel.session.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      onRecordError: (err: unknown) => {
        log.debug?.(`failed updating session meta: ${String(err)}`);
      },
    });

    const textLimit = core.channel.text.resolveTextChunkLimit(ctx.cfg, 'channel-talk');

    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        deliver: async (payload: { text?: string }) => {
          const replyText = payload.text;
          if (!replyText) {
            return;
          }

          const chunks = core.channel.text.chunkMarkdownText(replyText, textLimit);
          for (const chunk of chunks) {
            await apiClient.sendMessage({
              groupId,
              plainText: chunk,
              botName,
            });
          }
        },
        onError: (err: unknown) => {
          log.error('reply dispatch error', { error: String(err) });
        },
      });

    log.info('dispatching to agent', { sessionKey: route.sessionKey });

    try {
      const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg: ctx.cfg,
        dispatcher,
        replyOptions,
      });

      markDispatchIdle();
      log.info('dispatch complete', { queuedFinal, counts });
    } catch (err) {
      log.error('dispatch failed', { error: String(err) });
      ctx.runtime.error?.(`channel-talk dispatch failed: ${String(err)}`);
    }
  }

  const httpServer = app.listen(port, () => {
    log.info(`channel-talk webhook started on port ${port}, path ${webhookPath}`);
  });

  httpServer.on('error', (err: Error) => {
    log.error('server error', { error: String(err) });
  });

  ctx.setStatus?.({
    accountId,
    running: true,
    connected: true,
    lastStartAt: Date.now(),
    port,
    webhookPath,
  });

  const shutdown = async (): Promise<void> => {
    log.info('shutting down channel-talk webhook');
    clearInterval(dedupTimer);
    dedupCache.clear();
    return new Promise<void>((resolve) => {
      httpServer.close((err?: Error) => {
        if (err) {
          log.debug?.(`server close error: ${String(err)}`);
        }
        ctx.setStatus?.({
          accountId,
          running: false,
          connected: false,
          lastStopAt: Date.now(),
        });
        resolve();
      });
    });
  };

  if (ctx.abortSignal) {
    ctx.abortSignal.addEventListener('abort', () => {
      void shutdown();
    });
  }

  return { server: httpServer, shutdown };
}
