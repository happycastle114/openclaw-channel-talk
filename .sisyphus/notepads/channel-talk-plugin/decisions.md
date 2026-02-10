# Channel Talk Plugin - Architectural Decisions

## [2026-02-10T11:57:45Z] Initial Architecture

### Decision: Session Key Mapping
- **Choice**: Use `refers.group.id` as canonical session key
- **Rationale**: Team chat is group-scoped in Channel Talk; each group is a distinct conversation context
- **Alternative Considered**: Composite key `groupId:chatId` - rejected as over-complex for MVP

### Decision: Webhook Security
- **Choice**: Unguessable webhook path, no signature verification
- **Rationale**: Channel Talk doesn't provide webhook signature headers in v5 API
- **Compensating Controls**: Network-level controls (firewall, reverse proxy)
- **Alternative Considered**: Shared secret token - deferred to future if needed

### Decision: Self-Message Loop Prevention
- **Choice**: Filter `personType === 'bot'` on inbound webhook events
- **Rationale**: Prevents echo loops when bot sends messages
- **Implementation**: Check personType field before dispatching to OpenClaw runtime

### Decision: Duplicate Event Handling
- **Choice**: In-memory Map with 60s TTL keyed on `entity.id`
- **Rationale**: Simple MVP approach, handles webhook retry scenarios
- **Trade-off**: Lost on process restart - acceptable for MVP
- **Alternative Considered**: Persistent cache (Redis) - over-engineering for MVP

### Decision: Outbound Retry Policy
- **Choice**: 2 retries with exponential backoff (1s, 3s) on 429/5xx
- **Rationale**: Balances resilience with timeout budget
- **Implementation**: In api-client.ts sendMessage method
- **Failures**: Throw on 401/403 (auth), return error on other 4xx

### Decision: Text Chunk Limit
- **Choice**: 4000 characters
- **Rationale**: Channel Talk's practical message limit (no hard limit documented)
- **Implementation**: Use runtime.channel.text.chunkMarkdownText() with limit
