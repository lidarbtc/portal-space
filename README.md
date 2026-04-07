# Portal Space

2D 픽셀 멀티플레이어 협업 공간

> A 2D pixel multiplayer co-coding space built with Go, SvelteKit, and Phaser — exposed via [Portal Tunnel](https://github.com/gosuda/portal-tunnel).

![Portal Space](static/assets/og-image.jpg)

## 주요 기능

- **실시간 멀티플레이어** — WebSocket 기반, 최대 20명 동시 접속
- **채팅** — 게임 내 실시간 채팅 + 말풍선
- **이모트** — 이모지 이모트 표현
- **캐릭터 커스텀** — 아바타 색상(신체/눈/발) 커스터마이징
- **상태 표시** — online/away/dnd + 커스텀 상태 메시지
- **모바일 지원** — 반응형 UI + 터치 조이스틱
- **줌** — 픽셀퍼펙트 이산 줌 (데스크톱)
- **NAT 통과** — Portal Tunnel로 방화벽 뒤에서도 공개 URL 자동 생성

## 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | SvelteKit 2, Svelte 5, TypeScript, Vite |
| Game Engine | Phaser 3 |
| Backend | Go |
| 실시간 통신 | WebSocket (Gorilla) |
| 네트워크 노출 | Portal Tunnel v2 |
| 패키지 매니저 | Bun |

## 시작하기

### Prerequisites

- [Go](https://go.dev/) 1.26+
- [Bun](https://bun.sh/)

### 설치

```bash
git clone https://github.com/1ncursio/portal-space.git
cd portal-space
cd frontend && bun install
```

### 개발

두 개의 터미널이 필요합니다.

```bash
# 터미널 1: Go 백엔드 (포트 3001)
make dev-go

# 터미널 2: Vite 프론트엔드 개발 서버
make dev-frontend
```

Vite가 `/ws`, `/peer` 요청을 `localhost:3001`로 프록시합니다.

### 빌드

프론트엔드를 정적 빌드한 뒤 Go 바이너리에 임베드하여 단일 실행 파일을 생성합니다.

```
frontend/ → (bun run build) → static/ → (go build) → portal-space 바이너리
```

```bash
make build
```

## 프로젝트 구조

```
portal-space/
├── main.go             # 서버 진입점 + HTTP/Portal 라우팅
├── hub.go              # WebSocket 허브 (플레이어 관리, 브로드캐스트)
├── client.go           # WebSocket 클라이언트
├── protocol.go         # 메시지 프로토콜 정의
├── bootstrap.go        # static/ 임베드
├── Makefile
├── deploy.sh
├── frontend/
│   └── src/
│       ├── routes/         # SvelteKit 라우트
│       ├── lib/
│       │   ├── components/ # UI 컴포넌트
│       │   ├── game/       # Phaser 게임 로직
│       │   ├── stores/     # Svelte 스토어
│       │   ├── network.ts  # WebSocket 클라이언트
│       │   └── types.ts    # 타입 정의
│       └── app.css
└── static/                 # 빌드 출력 (Go embed 대상)
```

## 설정

| 플래그 | 환경변수 | 기본값 | 설명 |
|--------|----------|--------|------|
| `--port` | — | `3000` | 로컬 HTTP 포트 (음수로 비활성화) |
| `--discovery` | `DISCOVERY`, `DEFAULT_RELAYS` | `false` | 릴레이 레지스트리 탐색 활성화 |
| `--server-url` | `RELAY` | — | 릴레이 서버 URL (쉼표 구분) |
| `--ban-mitm` | `BAN_MITM` | `false` | TLS 종단 감지 시 릴레이 차단 |
| `--identity-path` | — | `identity.json` | Portal 신원 파일 경로 |
| `--name` | — | `space` | 백엔드 표시 이름 |

전체 옵션은 `./portal-space --help`를 참조하세요.

## 배포

```bash
./deploy.sh
```

내부적으로 `make build` 후 `--discovery=true`로 서버를 실행합니다.

## 라이선스

[Apache License 2.0](LICENSE)
