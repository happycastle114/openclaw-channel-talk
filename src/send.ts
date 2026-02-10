import type { ChannelOutboundAdapter } from 'openclaw/plugin-sdk';
import { sendMessage } from './api-client.js';
import { getChannelTalkRuntime } from './runtime.js';

export const channelTalkOutbound: ChannelOutboundAdapter = {
  deliveryMode: 'direct',

  chunker: (text, limit) =>
    getChannelTalkRuntime().channel.text.chunkMarkdownText(text, limit),

  chunkerMode: 'markdown',
  textChunkLimit: 4000,

  sendText: async ({ cfg, to, text }) => {
    const channelCfg = cfg.channels?.['channel-talk'] as
      | { accessKey?: string; accessSecret?: string; botName?: string }
      | undefined;

    if (!channelCfg?.accessKey || !channelCfg?.accessSecret) {
      throw new Error(
        'Channel Talk credentials not configured: missing accessKey or accessSecret in channels.channel-talk'
      );
    }

    const credentials = {
      accessKey: channelCfg.accessKey,
      accessSecret: channelCfg.accessSecret,
    };

    const result = await sendMessage(credentials, {
      groupId: to,
      plainText: text,
      botName: channelCfg.botName,
    });

    return {
      channel: 'channel-talk',
      messageId: result.messageId,
      conversationId: to,
    };
  },
};
