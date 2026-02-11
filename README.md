# @happycastle/channel-talk

> ⚠️ **Unofficial** — 이 플러그인은 Channel Corp 또는 OpenClaw 팀과 관련이 없는 커뮤니티 프로젝트입니다.

[Channel Talk (채널톡)](https://channel.io) Team Chat을 OpenClaw에 연동하는 채널 플러그인입니다.

## ✨ Features

- 📨 **Team Chat 메시지 수신** — 웹훅을 통해 채널톡 팀챗 메시지를 실시간으로 수신
- 💬 **메시지 발송** — OpenClaw 에이전트가 채널톡 팀챗에 직접 응답
- 🤖 **커스텀 봇 이름** — `botName` 설정으로 봇 표시 이름 변경 가능
- 🔄 **자동 재시도** — API 오류(429, 5xx) 시 지수 백오프 재시도
- 📝 **Markdown 청킹** — 긴 메시지를 자동으로 분할하여 전송
- 🔒 **중복 메시지 필터링** — 동일 메시지 중복 처리 방지

## 📋 Prerequisites

- [OpenClaw](https://github.com/nicepkg/openclaw)가 설치되어 실행 중이어야 합니다
- Channel Talk 계정 및 API 키 (Access Key + Access Secret)
- 웹훅 수신을 위한 공개 URL (Tailscale Funnel, ngrok, 리버스 프록시 등)

## 🚀 설치 및 설정 가이드

### 1단계: Channel Talk API 키 발급

1. [채널 데스크](https://desk.channel.io)에 로그인
2. **설정** → **보안 및 개발** → **API Key 관리**로 이동
3. **새 API Key 생성** 클릭
4. **Access Key**와 **Access Secret**을 안전하게 복사해 둡니다

### 2단계: 플러그인 설치

**npm을 통한 설치 (권장):**

```bash
openclaw plugins install @happycastle/channel-talk
```

**로컬 설치 (개발용):**

```bash
git clone https://github.com/happycastle114/openclaw-channel-talk.git
cd openclaw-channel-talk
npm install
# OpenClaw 설정에서 로컬 경로를 지정합니다
```

### 3단계: OpenClaw 설정

OpenClaw 설정 파일(`config.yaml` 또는 `config.json`)에 다음을 추가합니다:

```yaml
channels:
  channel-talk:
    # Channel Talk API 인증 정보 (필수)
    accessKey: "your-access-key"
    accessSecret: "your-access-secret"

    # 봇 표시 이름 (선택, 기본값: API 기본 봇 이름)
    botName: "MyBot"

    # 팀챗 그룹 정책 (선택, 기본값: "open")
    # "open" = 모든 팀챗 메시지 처리
    # "closed" = 팀챗 메시지 처리 안 함
    groupPolicy: "open"

    # 웹훅 서버 설정 (선택)
    webhook:
      port: 3979              # 기본값: 3979
      path: "/api/channel-talk"  # 기본값: /api/channel-talk
```

### 4단계: 웹훅 엔드포인트 공개

채널톡이 웹훅 이벤트를 보내려면 공개 URL이 필요합니다. 아래 방법 중 하나를 선택하세요:

**Tailscale Funnel (권장):**

```bash
tailscale funnel 3979
# https://your-machine.tail12345.ts.net 형태의 URL이 생성됩니다
```

**ngrok:**

```bash
ngrok http 3979
# https://xxxx-xxxx.ngrok-free.app 형태의 URL이 생성됩니다
```

**리버스 프록시 (Nginx, Caddy 등):**

기존 도메인이 있다면 리버스 프록시로 `localhost:3979`를 포워딩합니다.

### 5단계: Channel Talk 웹훅 등록

채널톡 API를 사용하여 웹훅을 등록합니다:

```bash
curl -X PUT "https://api.channel.io/open/v5/native/functions" \
  -H "x-access-key: YOUR_ACCESS_KEY" \
  -H "x-access-secret: YOUR_ACCESS_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "nativeFunctions": [{
        "name": "openclaw-webhook",
        "uri": "https://YOUR_PUBLIC_URL/api/channel-talk",
        "method": "POST",
        "headers": {}
      }]
    }
  }'
```

> 💡 `YOUR_PUBLIC_URL`을 4단계에서 얻은 공개 URL로 교체하세요.

### 6단계: 게이트웨이 시작

```bash
openclaw gateway start
```

이제 채널톡 Team Chat에서 메시지를 보내면 OpenClaw 에이전트가 응답합니다! 🎉

## ⚙️ Configuration Reference

| 키 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `accessKey` | `string` | ✅ | — | Channel Talk API Access Key |
| `accessSecret` | `string` | ✅ | — | Channel Talk API Access Secret |
| `enabled` | `boolean` | ❌ | `true` | 플러그인 활성화/비활성화 |
| `botName` | `string` | ❌ | — | 봇 메시지 표시 이름 |
| `groupPolicy` | `"open" \| "closed"` | ❌ | `"open"` | 팀챗 그룹 메시지 처리 정책 |
| `webhook.port` | `number` | ❌ | `3979` | 웹훅 서버 포트 |
| `webhook.path` | `string` | ❌ | `"/api/channel-talk"` | 웹훅 엔드포인트 경로 |

## 🏗️ Architecture

```
┌─────────────────┐     webhook POST      ┌──────────────────┐
│  Channel Talk   │ ───────────────────▶   │  OpenClaw        │
│  (Team Chat)    │                        │  Gateway         │
│                 │     API response       │                  │
│                 │ ◀───────────────────   │  ┌────────────┐  │
│                 │                        │  │ channel-    │  │
│                 │                        │  │ talk plugin │  │
└─────────────────┘                        │  └────────────┘  │
                                           │       │          │
                                           │       ▼          │
                                           │  ┌────────────┐  │
                                           │  │   Agent     │  │
                                           │  │  (LLM)     │  │
                                           │  └────────────┘  │
                                           └──────────────────┘

1. 채널톡 Team Chat에 메시지 작성
2. 웹훅이 POST /api/channel-talk 으로 이벤트 전달
3. 플러그인이 메시지를 파싱하여 에이전트에 전달
4. 에이전트가 응답 생성
5. Channel Talk API로 팀챗에 응답 전송
```

## 🔍 Verified API Behavior

개발 과정에서 확인된 Channel Talk API 동작 특이사항:

- **웹훅 이벤트 형식**: 이벤트는 `event: "push"`로 수신됩니다. 상위 레벨에 `type` 필드가 없을 수 있습니다.
- **Group ID 위치**: `groupId`는 `entity.chatId`에서 가져옵니다. `refers.group.id`에는 없을 수 있습니다.
- **`actAsManager` 옵션**: Team Chat에서 사용 시 `422` 에러가 발생합니다. 이 옵션은 User Chat 전용입니다.
- **`botName` 파라미터**: 쿼리 파라미터로 전달하면 커스텀 봇 이름이 정상 작동합니다.
- **메시지 발신자 타입**: 봇이 보낸 메시지는 `personType: "bot"`으로 표시됩니다.

## 🛠️ Troubleshooting

### 웹훅이 수신되지 않는 경우

1. 공개 URL이 올바르게 설정되었는지 확인합니다
2. 게이트웨이가 실행 중인지 확인합니다: `openclaw gateway status`
3. 포트가 방화벽에 의해 차단되지 않았는지 확인합니다
4. 웹훅 등록 curl 명령을 다시 실행합니다

### 인증 오류 (401/403)

- `accessKey`와 `accessSecret`이 올바른지 확인합니다
- API Key가 비활성화되지 않았는지 채널 데스크에서 확인합니다

### 메시지 전송 실패 (422)

- `actAsManager` 옵션을 사용하지 마세요 — Team Chat에서는 지원되지 않습니다
- `groupId`가 유효한 팀챗 그룹 ID인지 확인합니다

### 봇이 자기 메시지에 반응하는 경우

- 플러그인은 `personType: "bot"` 메시지를 자동으로 무시합니다
- 이 문제가 발생하면 로그를 확인해 주세요

## 📄 License

MIT

## ⚠️ Disclaimer

이 프로젝트는 **비공식 커뮤니티 프로젝트**입니다.
[Channel Corp](https://channel.io) 또는 [OpenClaw](https://github.com/nicepkg/openclaw) 팀과 어떠한 제휴 관계도 없습니다.
Channel Talk은 Channel Corp의 상표입니다.
