/**
 * Channel Talk Plugin Configuration Schema
 * Plain JSON Schema — avoids TypeBox compatibility issues with OpenClaw's config validator.
 */

export const ChannelTalkConfigSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    /** Enable/disable the Channel Talk plugin */
    enabled: {
      type: 'boolean' as const,
      default: true,
      description: 'Enable/disable the Channel Talk plugin',
    },

    /** Channel Talk API access key (required when enabled) */
    accessKey: {
      type: 'string' as const,
      description: 'Channel Talk access key for API authentication',
    },

    /** Channel Talk API access secret (required when enabled) */
    accessSecret: {
      type: 'string' as const,
      description: 'Channel Talk access secret for API authentication',
    },

    /** Webhook configuration */
    webhook: {
      type: 'object' as const,
      properties: {
        port: {
          type: 'number' as const,
          default: 3979,
          description: 'Port for webhook server (default: 3979)',
        },
        path: {
          type: 'string' as const,
          default: '/api/channel-talk',
          description: 'Path for webhook endpoint (default: /api/channel-talk)',
        },
      },
    },

    /** Bot display name for sent messages (optional) */
    botName: {
      type: 'string' as const,
      description: 'Bot display name for sent messages',
    },

    /** Group chat policy: "open" = all groups allowed, "closed" = none allowed */
    groupPolicy: {
      type: 'string' as const,
      enum: ['open', 'closed'],
      default: 'open',
      description: 'Group chat policy: "open" = all groups allowed, "closed" = none',
    },

    /** Allowlist of group chatIds to respond to */
    allowedGroups: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description:
        'List of group chatIds to respond to. If empty or omitted, all groups are allowed (subject to groupPolicy).',
    },

    /** Only respond when the bot is mentioned */
    mentionOnly: {
      type: 'boolean' as const,
      default: false,
      description:
        'Only respond when the bot is mentioned in the message. Similar to Discord mention-only mode.',
    },
  },
};

/**
 * TypeScript type for the config (manual, not derived from TypeBox)
 */
export interface ChannelTalkConfig {
  enabled?: boolean;
  accessKey: string;
  accessSecret: string;
  webhook?: { port?: number; path?: string };
  botName?: string;
  groupPolicy?: 'open' | 'closed';
  allowedGroups?: string[];
  mentionOnly?: boolean;
}
