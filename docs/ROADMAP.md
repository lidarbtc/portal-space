# Portal Space 로드맵 구현 계획 (v2 — Architect/Critic 피드백 반영)

> **Note (2026-04-16):** Go 백엔드는 Bun/TypeScript로 마이그레이션 완료됨.
> 이 문서의 Go 참조(`*.go`, Go 구조체 등)는 현재 `frontend/src/server/` 아래의 TypeScript 모듈에 대응합니다.
> 새 구조: `protocol.ts`, `storage.ts`, `hub.ts`, `room.ts`, `client.ts`, `yjs-relay.ts`

## RALPLAN-DR Summary

### Principles

1. **하이브리드 UI 일관성**: 모든 인터랙티브 기능은 "게임 월드 오브젝트 클릭 → Svelte UI 패널" 패턴을 따른다
2. **점진적 인프라 구축**: 인프라는 실제 기능과 함께 구축. Phase 0+1을 단일 스프린트로 실행하여 "인프라만 선행" 안티패턴 방지
3. **프로토콜 확장성**: Action Envelope 패턴으로 기존 메시지와 새 기능 메시지를 깔끔하게 분리
4. **서버 권위**: 모든 상태 변경은 서버에서 검증 (기존 이동 검증 패턴 유지)
5. **최소 의존성**: 현 스택(Go + Svelte + Phaser) 내에서 해결, 외부 서비스 최소화

### Decision Drivers (Top 3)

1. **인터랙티브 오브젝트 시스템 부재**: 현재 PlayerObject만 존재. 화이트보드 구현에 최소한의 오브젝트 시스템 필요 (범용화는 후속 Phase에서 점진 확장)
2. **영속성 레이어 부재**: 현재 인메모리 전용. 화이트보드 저장부터 DB 필요
3. **단일 맵 구조**: 60x45 하드코딩된 맵. 단, Phase 0에서 Room 추상화를 선행하여 Phase 2 리팩터링 비용 제거

### Viable Options

#### Option A: 순차 기능 개발 + Room 선행 추출 (Selected)

각 우선순위 기능을 순서대로 개발. Phase 0에서 Room 추상화와 최소 인프라를 화이트보드와 함께 구축.

**Pros:**

- 각 기능이 독립적으로 완성되어 점진적 가치 전달
- Room을 Phase 0에서 미리 추출하여 Phase 2 breaking refactor 제거
- 복잡도 관리 용이 (한 번에 하나씩)

**Cons:**

- Phase 0+1이 가장 무거움 (Room + DB + 화이트보드 동시 구축)
- Room 추출이 Option B의 "인프라 선행" 패턴처럼 보일 수 있으나, 구조 리팩터(~100 LOC)이지 기능 구현이 아니므로 위험 낮음

#### Option B: 인프라 선행 후 병렬 기능 개발

오브젝트 시스템, DB, 멀티맵을 먼저 모두 구축한 후 기능들을 병렬 개발.

**Pros:**

- 인프라가 완비된 상태에서 기능 개발이 깔끔
- 병렬 개발 가능 (팀이 있다면)

**Cons:**

- 1인 개발 시 병렬화 불가 — 순차와 동일
- 인프라만 먼저 구축하면 체감 가치 없이 시간 소모
- 인프라 설계 시 실제 기능 요구사항 파악 어려움 (over-engineering 위험)
- 멀티맵 로더, 범용 오브젝트 시스템, 가구 인벤토리 등을 화이트보드 하나 만들기 전에 설계하면 실제 요구사항과 괴리 발생

**Option B 기각 이유:** 1인(소수) 개발 환경에서 병렬화 이점 없음. 인프라만 선행하면 실제 사용 맥락 없이 over-engineering 위험. Option A는 Room 추출(구조 리팩터)만 선행하고 나머지 인프라는 기능과 함께 구축.

---

## Risks & Mitigations

| Risk                                 | Impact                   | Mitigation                                      |
| ------------------------------------ | ------------------------ | ----------------------------------------------- |
| SQLite 동시 쓰기 (N명이 동시 드로잉) | 런타임 에러, 데이터 손실 | 전용 writer 고루틴 + 채널 기반 직렬화 (Phase 0) |
| 화이트보드 스트로크 무한 증가        | 새 참여자 조인 지연      | 스트로크 500개 초과 시 스냅샷 압축 (Phase 1)    |
| Phase 0+1 스코프 과대                | 번아웃, 가치 전달 지연   | Phase 0+1 단일 스프린트, 최소 필드만 구현       |
| Auth 없이 소유권 기능                | Phase 5/6 무의미         | Phase 4.5에 경량 세션 토큰 스케줄링             |
| 타일셋 아트 에셋 부재                | Phase 2 블로커           | Phase 1 완료 후 에셋 확보 방안 결정             |
| IncomingMessage 구조체 비대화        | 유지보수 불가            | Action Envelope 패턴으로 분리 (Phase 0)         |

---

## Phase 0+1: 화이트보드 + 최소 인프라 (단일 스프린트)

> Phase 0과 1을 병합하여 "인프라만 선행" 안티패턴을 방지합니다.
> 인프라는 화이트보드가 실제로 필요로 하는 것만 구축합니다.

### 0-1. Room 추출 (Hub 리팩터링)

**목표:** Hub에서 Room 개념을 분리하여 향후 멀티맵 확장 준비. 현재는 단일 "default" Room.

**백엔드 (Go):**

- `room.go` (신규): Room 구조체
    ```go
    type Room struct {
      id         string
      clients    map[*Client]bool
      objects    map[string]*InteractiveObject
      collision  [][]bool  // 동적 크기 (Phase 2 가변 맵 대비)
      broadcast  chan []byte
      register   chan *Client
      unregister chan *Client
      width      int
      height     int
    }
    ```
- `hub.go` 수정: `Hub.rooms map[string]*Room` + 단일 "default" Room
- `client.go` 수정: `Client.hub *Hub` → `Client.room *Room` + `Client.hub *Hub` (Room은 현재 방, Hub은 전역)
- 기존 브로드캐스트/플레이어 관리 로직을 Room으로 이동
- **충돌 맵:** 패키지 레벨 `var collisionMap` → Room 필드로 이동, `[][]bool` 슬라이스 (가변 크기)

### 0-2. Action Envelope 프로토콜

**목표:** 기존 메시지(chat, move, emote 등)는 그대로 두고, 새 기능 메시지는 Action Envelope로 분리

```go
// 기존 메시지 타입은 변경 없음
const (
  MsgJoin    MsgType = "join"
  MsgMove    MsgType = "move"
  // ... 기존 8개 유지
  MsgAction  MsgType = "action"  // 신규: Action Envelope 진입점
)

// Action Envelope (새 기능용)
type ActionMessage struct {
  Domain   string          `json:"domain"`   // "wb", "game", "content", "board", "furniture"
  Action   string          `json:"action"`   // "stroke", "clear", "join", etc.
  ObjectID string          `json:"objectId,omitempty"`
  Payload  json.RawMessage `json:"payload"`
}
```

- `client.go`: `readPump` switch에 `MsgAction` 케이스 추가 → 도메인 디스패처로 라우팅
- `frontend/src/lib/network.ts`: `sendAction(domain, action, objectId, payload)` 메서드 추가
- 기존 IncomingMessage/OutgoingMessage 구조체는 **변경 없음** (하위 호환성)

### 0-3. 영속성 레이어 (SQLite)

**목표:** 화이트보드 스트로크 저장에 필요한 최소 DB

**백엔드:**

- `storage.go` (신규): SQLite 래퍼
    - `modernc.org/sqlite` 사용 (CGo 불필요, 크로스 컴파일 용이)
    - **쓰기 직렬화:** 전용 writer 고루틴 + `chan WriteOp` 패턴

        ```go
        type Storage struct {
          db      *sql.DB
          writeCh chan WriteOp
        }

        type WriteOp struct {
          query  string
          args   []any
          result chan error
        }

        func (s *Storage) run() {
          for op := range s.writeCh {
            _, err := s.db.Exec(op.query, op.args...)
            op.result <- err
          }
        }
        ```

    - 읽기: 동시 가능 (WAL 모드)
    - `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`

- 초기 스키마:
    ```sql
    CREATE TABLE whiteboard_strokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      stroke_data TEXT NOT NULL,  -- JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_strokes_board ON whiteboard_strokes(board_id);
    ```
- `go.mod`: `modernc.org/sqlite` 의존성 추가

### 0-4. 인터랙티브 오브젝트 (화이트보드 전용 최소 구현)

**목표:** 화이트보드에 필요한 최소한의 오브젝트 시스템. 범용화는 후속 Phase에서 점진 확장.

**백엔드 (Go):**

```go
type InteractiveObject struct {
  ID    string          `json:"id"`
  Type  string          `json:"type"`    // Phase 0: "whiteboard"만
  X     float64         `json:"x"`
  Y     float64         `json:"y"`
  State json.RawMessage `json:"state,omitempty"`  // 타입별 상태 (json.RawMessage로 타입 안전성 확보)
}
```

- Phase 0에서는 `Width`, `Height`, `MapID`, `OwnerID` 필드 **미포함** (YAGNI)
- Phase 2에서 `MapID` 추가, Phase 5에서 `OwnerID` + `Width`/`Height` 추가

**프론트엔드:**

- `frontend/src/lib/game/objects/interactive-object.ts`: 최소 베이스
    - Phaser Container 기반
    - 클릭 이벤트 → Svelte 커스텀 이벤트 디스패치
    - 근접 검사: 유클리드 거리 1.5타일 이내 (기존 `proximityRadius` 패턴 참고, hub.go:12)
- `frontend/src/lib/stores/objects.ts`: 오브젝트 상태 스토어
- `world.ts`: 오브젝트 스폰/제거 로직 추가

### 1-1. 월드 오브젝트로서의 칠판

- `world.ts`: 맵 데이터에 칠판 오브젝트 위치 정의 (타일 좌표)
- 칠판 스프라이트 렌더링 (Phaser Sprite, 2x3 타일 크기)
- 근접 상호작용: 플레이어가 1.5타일 이내 + 클릭 시 화이트보드 UI 열림
- 상호작용 인디케이터: 근접 시 "[E] 사용" 또는 하이라이트 효과
- 키보드 단축키: E키로 가장 가까운 오브젝트 상호작용

### 1-2. 화이트보드 Svelte UI

- `frontend/src/lib/components/Whiteboard.svelte`
    - HTML5 Canvas 기반 드로잉 (Phaser와 별도, DOM 오버레이)
    - 도구: 펜(색상/굵기), 지우개, 텍스트, 도형(선/사각/원)
    - 레이어: 배경 레이어 + 드로잉 레이어
    - 줌/팬 지원
- `frontend/src/lib/stores/whiteboard.ts`: 화이트보드 상태 관리
- bits-ui Dialog 기반 모달 (기존 SettingsModal 패턴 활용)

### 1-3. 실시간 드로잉 동기화

**프로토콜 (Action Envelope 사용):**

```
Domain: "wb"
Actions: "stroke" | "clear" | "state" | "snapshot"
```

**동기화 전략:**

- 스트로크 단위 전송 (포인트 배열 + 색상/굵기)
- 클라이언트: 100ms 간격 배치 전송 (최대 10msg/sec)
- 서버: Room 내 화이트보드 참여자에게만 브로드캐스트
- 서버: 스트로크 SQLite 저장 (writer 고루틴 경유)
- 새 참여자 조인 시: 스냅샷 + 이후 스트로크 전송

**스트로크 Compaction:**

- 보드별 스트로크 500개 초과 시 자동 스냅샷 생성
- 스냅샷: 모든 스트로크를 하나의 압축 상태로 병합
- 이후 새 스트로크는 스냅샷 위에 추가
- 새 참여자는 최신 스냅샷 + 이후 스트로크만 수신

**충돌 해결:** 동일 영역 동시 드로잉 시 서버 수신 순서대로 적용 (last-write-wins). 드로잉은 누적 특성상 순서 충돌이 기능적 문제를 일으키지 않음.

**레이트 리밋:** 배치 전송이므로 초당 10회 제한 (100ms 간격과 일치)

### 1-4. 저장/불러오기

- 서버 측 SQLite에 보드별 스트로크 저장
- 서버 재시작 후에도 복원 (SQLite에서 로딩)
- 보드 초기화(clear) 기능 → 스트로크 삭제 + 스냅샷 리셋

### Phase 0+1 Acceptance Criteria

- [ ] Hub→Room 리팩터링 완료, 단일 "default" Room에서 기존 기능 정상 동작
- [ ] Action Envelope로 wb:stroke 메시지 송수신 가능
- [ ] 게임 월드에 칠판 오브젝트가 렌더링됨
- [ ] 근접(1.5타일) + 클릭/E키로 화이트보드 UI 열림
- [ ] 펜/지우개/색상/텍스트 도구 동작
- [ ] 여러 플레이어가 동시에 그리면 실시간 동기화
- [ ] 서버 재시작 후 보드 내용 유지 (SQLite)
- [ ] 스트로크 500개 초과 시 스냅샷 compaction 동작

### Phase 0+1 Verification

- **단위 테스트:** SQLite writer 고루틴 동시성 테스트, Action 메시지 라우팅 테스트
- **통합 테스트:** 2개 WebSocket 클라이언트로 동시 드로잉 → 양쪽 동기화 확인
- **수동 QA:** 브라우저 2개 열어 화이트보드 공동 편집, 서버 재시작 후 복원 확인

---

## Phase 2: 맵/방 다양화 (Priority 2)

### 2-1. 맵 데이터 구조화

**현재:** `generateMapData()` 에서 하드코딩
**변경:** JSON 기반 맵 정의 파일

```typescript
interface MapDefinition {
	id: string
	name: string
	width: number
	height: number
	tiles: number[][] // 타일 데이터
	collisions: boolean[][] // 충돌 맵
	objects: InteractiveObject[] // 배치된 오브젝트
	portals: Portal[] // 다른 맵으로의 포탈
	spawnPoints: Point[] // 스폰 위치
	theme: {
		tilesetKey: string
		backgroundColor: string
	}
}
```

- `frontend/src/lib/game/maps/`: 맵 정의 JSON 파일들
    - `office.json` (기존 맵 마이그레이션)
    - `lounge.json` (소셜/휴식 공간)
    - `workshop.json` (작업/프로젝트 공간)

### 2-2. 서버 측 멀티맵

- Phase 0에서 추출한 Room에 맵 로딩 로직 추가
- `Room.loadMap(def *MapDefinition)`: JSON에서 충돌맵, 오브젝트 초기화
- Hub가 여러 Room 인스턴스 관리 (기존 단일 default → 복수)
- `InteractiveObject`에 `MapID` 필드 추가 (이 시점에서 필요해짐)

### 2-3. 맵 전환 프로토콜

```
Domain: "map"
Actions: "change" | "list"
```

- 포탈 진입 시: 현재 Room에서 unregister → 대상 Room에서 register
- 클라이언트: Room 전환 시 씬 리로드 (새 타일맵 로딩)
- 전환 애니메이션: 페이드 아웃 → 로딩 → 페이드 인

### 2-4. 포탈 시스템

- 포탈 = InteractiveObject (type: "portal")
- 맵 경계 또는 특정 위치에 배치
- 자동 진입 (walk-through) 또는 클릭 진입 (설정 가능)

### 2-5. 맵 자산 (타일셋)

- 현재 프로시저럴 타일셋 → 테마별 PNG 타일셋으로 교체
- `frontend/static/assets/maps/`: 타일셋 이미지들
- Phaser의 Tilemap API로 JSON + 타일셋 로딩

### Phase 2 Acceptance Criteria

- [ ] 최소 3개 맵 (오피스, 라운지, 워크숍)
- [ ] 포탈로 맵 간 이동 가능
- [ ] 각 맵에 고유 시각적 테마
- [ ] 맵 전환 시 부드러운 전환 효과
- [ ] JSON 파일 추가만으로 새 맵 생성 가능
- [ ] 기존 화이트보드가 특정 맵의 오브젝트로 정상 동작

### Phase 2 Verification

- **단위 테스트:** 맵 JSON 로딩/파싱, Room 간 클라이언트 이동
- **통합 테스트:** 포탈 통과 → 새 맵 로딩 → 다른 플레이어에게 보임 확인
- **수동 QA:** 3개 맵 순회, 포탈 전환 시 끊김 없는지 확인

---

## Phase 3: 미니게임/액티비티 (Priority 3)

### 3-1. 미니게임 프레임워크

- `frontend/src/lib/game/minigames/`: 미니게임 모듈 디렉터리
- `base-minigame.ts`: 공통 인터페이스
    ```typescript
    interface MiniGame {
    	id: string
    	name: string
    	minPlayers: number
    	maxPlayers: number
    	init(players: string[]): void
    	handleAction(playerId: string, action: GameAction): void
    	getState(): GameState
    	isFinished(): boolean
    }
    ```
- 게임 오브젝트(예: 아케이드 기계) = InteractiveObject (type: "minigame")
- 클릭 → 대기실 → 게임 시작

### 3-2. 첫 번째 미니게임: 틱택토 (간단한 MVP)

- 2인 대전, 턴 기반
- Svelte UI 모달로 렌더링
- WebSocket으로 턴 동기화
- 결과 채팅에 공유

### 3-3. 서버 측 게임 로직

```
Domain: "game"
Actions: "join" | "action" | "state" | "end" | "leave"
```

- 서버 권위: 게임 상태는 서버에서 관리
- 게임 인스턴스 생명주기: 생성 → 진행 → 종료 → 정리
- 비활성 게임 인스턴스 자동 정리 (5분 타임아웃)

### Phase 3 Acceptance Criteria

- [ ] 월드 내 게임 오브젝트 존재 및 클릭 가능
- [ ] 최소 1개 미니게임 (틱택토) 플레이 가능
- [ ] 멀티플레이어 대전 동작
- [ ] 게임 결과가 채팅에 표시

### Phase 3 Verification

- **단위 테스트:** 틱택토 게임 로직 (승리 조건, 턴 전환)
- **통합 테스트:** 2 클라이언트 대전 시나리오
- **수동 QA:** 실제 2인 플레이 테스트

---

## Phase 4: 공유 콘텐츠 (Priority 4)

### 4-1. 콘텐츠 공유 시스템

- 채팅 또는 전용 UI에서 URL 입력
- 지원 타입: YouTube 임베드, 이미지, 웹 링크
- `frontend/src/lib/components/SharedContent.svelte`: 뷰어 모달

### 4-2. 동기화된 시청

```
Domain: "content"
Actions: "share" | "sync" | "close"
```

- 호스트(공유자)의 재생 상태를 다른 플레이어에게 동기화
- YouTube: iframe API로 재생 제어
- 같은 Room 내 플레이어에게만 공유

### Phase 4 Acceptance Criteria

- [ ] URL 입력으로 콘텐츠 공유
- [ ] YouTube 동기화 시청 가능
- [ ] 재생/일시정지/탐색 동기화
- [ ] Room 내 플레이어에게만 표시

### Phase 4 Verification

- **통합 테스트:** YouTube URL 공유 → 2 클라이언트 동기화 재생 확인
- **수동 QA:** 실제 YouTube 영상 동기화 시청

---

## Phase 4.5: 경량 인증 시스템

> Phase 5(가구 소유권)와 Phase 6(프로젝트 보드 접근)에 필요한 영속적 사용자 ID.
> 현재: 접속할 때마다 새 UUID 발급 (`client.go:53`). 소유권 추적 불가.

### 4.5-1. 세션 토큰 기반 인증

- `auth.go` (신규): 세션 관리
- 첫 접속 시: 서버가 세션 토큰 발급 → 클라이언트 localStorage 저장
- 재접속 시: 토큰 전송 → 같은 사용자 ID 복원
- 토큰 형식: 랜덤 32바이트 hex (JWT 불필요, 단일 서버)
- SQLite `sessions` 테이블: `token`, `user_id`, `nickname`, `last_seen`

### 4.5-2. 프론트엔드 통합

- `network.ts`: 접속 시 저장된 토큰 전송
- `MsgJoin`에 `token` 필드 추가
- 기존 사용자는 토큰 없이 접속 가능 (하위 호환) → 새 토큰 발급

### Phase 4.5 Acceptance Criteria

- [ ] 첫 접속 시 세션 토큰 발급 및 localStorage 저장
- [ ] 재접속 시 같은 사용자 ID 복원
- [ ] 서버 재시작 후에도 토큰 유효 (SQLite 저장)
- [ ] 토큰 없는 접속도 허용 (하위 호환)

### Phase 4.5 Verification

- **단위 테스트:** 토큰 생성/검증, 세션 복원
- **수동 QA:** 브라우저 닫고 재접속 시 같은 닉네임/ID 복원 확인

---

## Phase 5: 가구/장식 커스터마이징 (Priority 5)

### 5-1. 가구 시스템

- InteractiveObject 확장: `Width`, `Height`, `OwnerID` 필드 추가 (이 시점에서 필요해짐)
- 가구 카탈로그: JSON 정의 (스프라이트, 크기, 충돌 영역)
- 배치 모드: 그리드 기반 드래그 앤 드롭
- 충돌맵 동적 업데이트 (Room.collision 슬라이스 수정)

### 5-2. 인벤토리 & 배치 UI

- `frontend/src/lib/components/FurniturePanel.svelte`
- 카탈로그 브라우저 (카테고리별)
- 배치 프리뷰 (고스트 오브젝트)
- 회전/제거 기능

### 5-3. 영속성

- SQLite에 가구 배치 데이터 저장
- Room별 가구 목록
- 소유권: Phase 4.5의 세션 토큰으로 사용자 식별

### 5-4. 에셋 결정 (Phase 2 완료 후)

- 가구 스프라이트 확보 방안: 직접 픽셀아트 제작 / 에셋 스토어 / AI 생성
- 최소 10종 카테고리: 테이블, 의자, 식물, 조명, 책장, 소파, 포스터, 러그, 컴퓨터, 화분

### Phase 5 Acceptance Criteria

- [ ] 가구 카탈로그에서 아이템 선택 가능
- [ ] 그리드 기반 배치/제거
- [ ] 최소 10종 가구 아이템
- [ ] 서버 재시작 후 배치 유지
- [ ] 소유자만 자신의 가구 제거 가능

### Phase 5 Verification

- **단위 테스트:** 가구 배치/충돌맵 업데이트, 소유권 검증
- **통합 테스트:** 배치 → 서버 재시작 → 복원 확인
- **수동 QA:** 2인 접속, 각자 가구 배치, 상대방 가구 제거 불가 확인

---

## Phase 6: 프로젝트 관리보드 (Priority 6)

### 6-1. 칸반 보드 UI

- `frontend/src/lib/components/ProjectBoard.svelte`
- 컬럼: TODO / In Progress / Done (커스텀 가능)
- 태스크 카드: 제목, 설명, 담당자, 레이블
- 드래그 앤 드롭으로 카드 이동

### 6-2. 실시간 협업

```
Domain: "board"
Actions: "sync" | "task_create" | "task_update" | "task_delete" | "task_move"
```

- 서버 권위 + 낙관적 업데이트
- SQLite에 보드/태스크 영속화

### Phase 6 Acceptance Criteria

- [ ] 월드 내 보드 오브젝트 클릭으로 진입
- [ ] 칸반 보드 렌더링 및 조작
- [ ] 실시간 멀티플레이어 편집
- [ ] 태스크 CRUD + 드래그 이동
- [ ] 서버 재시작 후 데이터 유지

### Phase 6 Verification

- **단위 테스트:** 태스크 CRUD, 컬럼 이동 로직
- **통합 테스트:** 2 클라이언트 동시 편집 충돌 해결
- **수동 QA:** 칸반 보드 전체 워크플로 테스트

---

## 파일 변경 요약

### 신규 파일

| 파일                                                  | Phase | 설명                        |
| ----------------------------------------------------- | ----- | --------------------------- |
| `room.go`                                             | 0     | Room 구조체 (Hub에서 분리)  |
| `storage.go`                                          | 0     | SQLite 래퍼 + writer 고루틴 |
| `auth.go`                                             | 4.5   | 세션 토큰 관리              |
| `frontend/src/lib/game/objects/interactive-object.ts` | 0     | 최소 오브젝트 베이스        |
| `frontend/src/lib/stores/objects.ts`                  | 0     | 오브젝트 상태 스토어        |
| `frontend/src/lib/components/Whiteboard.svelte`       | 1     | 화이트보드 UI               |
| `frontend/src/lib/stores/whiteboard.ts`               | 1     | 화이트보드 상태             |
| `frontend/src/lib/game/maps/*.json`                   | 2     | 맵 정의 파일들              |
| `frontend/src/lib/game/minigames/`                    | 3     | 미니게임 모듈               |
| `frontend/src/lib/components/SharedContent.svelte`    | 4     | 공유 콘텐츠 뷰어            |
| `frontend/src/lib/components/FurniturePanel.svelte`   | 5     | 가구 배치 UI                |
| `frontend/src/lib/components/ProjectBoard.svelte`     | 6     | 칸반 보드 UI                |

### 수정 파일

| 파일                          | Phase     | 변경 내용                                                  |
| ----------------------------- | --------- | ---------------------------------------------------------- |
| `protocol.go`                 | 0,2,4.5,5 | ActionMessage 추가, InteractiveObject 점진 확장, 토큰 필드 |
| `hub.go`                      | 0         | rooms 맵 관리, Room으로 로직 이관                          |
| `client.go`                   | 0,2,4.5   | Room 참조 추가, MsgAction 라우팅, 맵전환 핸들링, 토큰 인증 |
| `world.ts`                    | 0,1,2     | 오브젝트 렌더링, 맵 로딩 변경                              |
| `frontend/src/lib/types.ts`   | 0         | ActionMessage, InteractiveObject 타입                      |
| `frontend/src/lib/network.ts` | 0,4.5     | sendAction() 메서드, 토큰 전송                             |
| `+page.svelte`                | 1,2       | 새 컴포넌트 통합                                           |
| `go.mod`                      | 0         | modernc.org/sqlite 추가                                    |

---

## ADR: 구현 전략

**Decision:** Option A — 순차 기능 개발 + Room 선행 추출 + Action Envelope

**Drivers:**

- 1인(소수) 개발 환경에서 병렬화 불가
- Room 추출을 Phase 0에서 선행하여 Phase 2 breaking refactor 제거 (~100 LOC 구조 리팩터)
- Action Envelope로 기존 프로토콜 건드리지 않으면서 확장성 확보
- 인프라를 실제 기능(화이트보드)과 함께 구축하여 over-engineering 방지

**Alternatives Considered:**

- Option B (인프라 선행 후 병렬 개발): 체감 가치 없이 인프라만 구축하는 기간 발생, over-engineering 위험. Option B의 유효한 점(Room 선행 추출)만 Option A에 흡수.

**Why Chosen:**

- Phase 0+1을 단일 스프린트로 실행하여 첫 기능(화이트보드) 완성과 인프라 구축을 동시 달성
- Action Envelope로 readPump switch 비대화 방지 (도메인 디스패처 패턴)
- SQLite writer 고루틴으로 동시성 문제 선제 해결
- 이후 Phase들은 이 인프라를 재사용하여 개발 속도 가속

**Consequences:**

- Phase 0+1이 가장 무거움 (Room + DB + 프로토콜 + 화이트보드)
- SQLite 선택으로 향후 스케일링 시 마이그레이션 필요할 수 있음 (현재 20명 규모에서는 충분)
- Phase 4.5 인증 추가로 전체 Phase 수 증가 (6 → 7)

**Follow-ups:**

- 타일셋 아트 에셋 확보 방안 결정 (Phase 1 완료 후, Phase 2 시작 전)
- 프론트엔드 코드 스플리팅 전략 (Phase 3+ 이후 번들 사이즈 모니터링)
