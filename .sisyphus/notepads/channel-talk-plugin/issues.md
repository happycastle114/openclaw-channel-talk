# Channel Talk Plugin - Issues & Gotchas

## [2026-02-10T11:57:45Z] Session Start

### Known Edge Cases to Handle
- Empty/whitespace-only `plainText` → drop with log
- Missing `refers.group.id` → drop with log (can't reply)
- Bot messages (`personType === 'bot'`) → filter before dispatch
- Duplicate webhook deliveries → dedup cache check
- Non-UTF8 or very long text → rely on chunker

### API Limitations
- No webhook signature verification available in Channel Talk v5 API
- No documented max message length (using 4000 chars conservatively)
- No threading/reply-to support in API (out of scope anyway)

### Implementation Risks Mitigated
- Inbound/outbound key mismatch → locked to `refers.group.id` everywhere
- Webhook spoofing → unguessable path + network controls
- Echo loops → personType filtering
- Silent API drift → defensive parsing with structured drop logs
- Scope creep → explicit Must NOT Have list in plan
