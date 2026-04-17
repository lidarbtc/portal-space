# 화이트보드 Y.js + Konva.js 리팩터링 계획 (v2 — Architect/Critic 반영)

> **Note (2026-04-16):** Go 백엔드는 Bun/TypeScript로 마이그레이션 완료됨.
> Y.js 릴레이는 `frontend/src/server/yjs-relay.ts`에 구현되어 있음. Go 코드 참조는 역사적 맥락임.

## RALPLAN-DR Summary

### Principles

1. **라이브러리 우선**: 자체 구현 대신 Y.js(CRDT) + Konva.js(Canvas) 활용
2. **React 불가**: Vanilla JS/Svelte 네이티브 라이브러리만 사용
3. **단일 서버**: Go 서버에 Y.js 중계 엔드포인트 추가, 별도 서버 없음
4. **점진적 교체**: 기존 whiteboard.go/Whiteboard.svelte를 교체하되 Room/오브젝트 시스템은 유지

### Decision Drivers

1. **CRDT 동기화**: 커스텀 브로드캐스트 → Y.js CRDT로 충돌 없는 동시 편집
2. **Canvas 라이브러리**: 순수 Canvas API → Konva.js로 도형/텍스트/선택/이동 지원
3. **협업 UX**: 단순 동기화 → 커서/이름/선택 영역 공유

### Viable Options

#### Option A: Y.js + Konva.js + Go 중계 (Selected)

**Pros:**

- Konva는 Vanilla JS 호환, 도형/텍스트/레이어 기본 지원 (~150KB)
- Y.js는 CRDT 표준, awareness API로 커서/선택 내장 (~30KB)
- Go 중계는 ~200-250 LOC로 비교적 간단

**Cons:**

- Konva ↔ Y.js 바인딩 직접 구현 필요 (~300-500 LOC, 공식 바인딩 없음)
- Go에서 y-websocket 바이너리 프로토콜 일부 구현 필요

#### Option B: Y.js + Fabric.js

**기각 이유:** 불필요하게 무겁고(~300KB), Portal Space의 최소 도구 세트에 Konva가 충분.

---

## ⚠️ Data Migration Notice

기존 화이트보드 데이터(whiteboard_strokes, whiteboard_snapshots)는 **영구 삭제**됩니다. Y.js CRDT 문서 형식과 호환되지 않으므로 마이그레이션 불가. 사용자 동의 필요.

## Risks & Mitigations

| Risk                                 | Impact                             | Mitigation                                           |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| y-websocket 프로토콜 복잡도 과소평가 | Go relay 구현 지연                 | Phase 0 스파이크로 먼저 검증                         |
| Konva↔Y.js 바인딩 예상보다 복잡      | 구현 ~300-500 LOC                  | 스파이크에서 기본 도형 바인딩 먼저 확인              |
| 기존 데이터 손실                     | 사용자 불만                        | 명시적 고지 + 새 시스템이 더 우수                    |
| Portal Tunnel 경유 시 Y.js WS 미도달 | 릴레이 접속 사용자 화이트보드 불가 | `/peer/{token}/ws/yjs/{boardId}` 라우트 추가         |
| Y.js Provider 연결 누수              | 메모리 증가                        | 모달 close 시 provider.destroy() + awareness cleanup |

---

## Phase 0: 스파이크 — Go Y.js Relay 검증

**목표:** Go에서 y-websocket 프로토콜을 구현하고, 2개 브라우저 탭에서 Y.js 동기화가 동작하는지 검증.

### 0-1. y-websocket 바이너리 프로토콜 이해

y-websocket 메시지 프레임:

```
[message_type_byte] [payload...]

message_type:
  0 = sync (Y.js document sync)
    sub-type in payload[0]:
      0 = sync step 1 (client sends state vector)
      1 = sync step 2 (server/peer responds with state diff)
      2 = update (incremental change)
  1 = awareness (cursor/selection ephemeral state)
  2 = auth (not used in this implementation)
```

### 0-2. Go Y.js Relay 구현

**신규 파일:** `yjs_relay.go` (~200-250 LOC)

```go
type YjsRelay struct {
    mu       sync.RWMutex
    rooms    map[string]*yjsRoom
    storage  *Storage
}

type yjsRoom struct {
    clients    map[*websocket.Conn]bool
    docState   []byte  // Y.encodeStateAsUpdate() 결과
    awareness  []byte  // 최신 awareness 상태
}
```

**프로토콜 핸들링:**

1. **클라이언트 연결 시:**
    - rooms에 추가
    - 저장된 docState가 있으면 sync step 2로 전송 (msg_type=0, sub_type=1, payload=docState)
2. **sync step 1 수신 (state vector):**
    - 저장된 docState에서 diff 계산은 불가 (Go에서 Y.js 파싱 없음)
    - 대신 전체 docState를 sync step 2로 응답 (약간 비효율적이지만 정확)
3. **sync step 2 / update 수신:**
    - 다른 클라이언트에 포워딩
    - docState 업데이트: 수신한 바이트를 누적 (주기적으로 연결된 클라이언트에 전체 상태 요청)
4. **awareness 수신:**
    - 다른 클라이언트에 포워딩 (영속화 불필요)
5. **연결 종료 시:**
    - rooms에서 제거
    - 마지막 클라이언트 종료 시 docState를 SQLite에 저장

### 0-3. 영속화

- `storage.go` 확장:
    ```sql
    CREATE TABLE IF NOT EXISTS yjs_documents (
      board_id TEXT PRIMARY KEY,
      doc_state BLOB NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```
- 주기적 저장: 30초 간격 또는 마지막 클라이언트 종료 시
- "마지막 클라이언트" = rooms[boardId].clients가 비었을 때

### 0-4. main.go 라우팅

```go
// 게임 WS와 별도 엔드포인트
mux.HandleFunc("/ws/yjs/", relay.ServeHTTP)

// Portal Tunnel 경유 라우트도 추가
// /peer/{token}/ws/yjs/{boardId} → relay.ServeHTTP
```

### 0-5. 스파이크 검증 기준

- [ ] 2개 브라우저 탭에서 Y.js 문서 동기화 확인
- [ ] 빈 룸에 접속 시 저장된 문서 상태 복원 확인
- [ ] 서버 재시작 후 문서 상태 유지 확인
- [ ] awareness (커서 위치) 양방향 전달 확인

스파이크 실패 시: Node.js y-websocket 사이드카 검토.

---

## Phase 1: 프론트엔드 — Konva.js + Y.js 통합

### 1-1. 의존성 추가

```bash
bun add yjs y-websocket konva
```

### 1-2. Y.js 문서 모델

**신규:** `frontend/src/lib/whiteboard/yjs-doc.ts`

```typescript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export function createWhiteboardDoc(boardId: string) {
	const ydoc = new Y.Doc()
	const yShapes = ydoc.getArray<Y.Map<any>>('shapes')
	const yUndoManager = new Y.UndoManager(yShapes)

	const wsUrl = buildYjsWsUrl(boardId)
	const provider = new WebsocketProvider(wsUrl, boardId, ydoc)
	const awareness = provider.awareness

	return { ydoc, yShapes, yUndoManager, provider, awareness }
}

function buildYjsWsUrl(boardId: string): string {
	const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
	const peerMatch = location.pathname.match(/^\/peer\/([^/]+)\//)
	const prefix = peerMatch ? `/peer/${peerMatch[1]}` : ''
	return `${proto}//${location.host}${prefix}/ws/yjs/${boardId}`
}
```

### 1-3. Konva ↔ Y.js 바인딩

**신규:** `frontend/src/lib/whiteboard/konva-yjs-binding.ts` (~300-500 LOC)

**핵심 설계:**

- 각 Konva 도형 = Y.Map (`{ id, type, x, y, stroke, strokeWidth, points, text, ... }`)
- yShapes (Y.Array) observe → Konva Stage 업데이트
- Konva 이벤트 (dragend, transformend) → Y.Map 업데이트
- **Freehand 펜 최적화:**
    - 드로잉 중: awareness를 통해 진행 중인 포인트 배열 전송 (ephemeral)
    - pointer-up: 완성된 스트로크를 Y.Map으로 yShapes에 커밋 (persisted)
    - 다른 사용자는 awareness에서 진행 중인 스트로크를 렌더링

### 1-4. 협업 커서/선택 렌더링

**신규:** `frontend/src/lib/whiteboard/awareness-renderer.ts`

```typescript
awareness.setLocalStateField('cursor', { x, y })
awareness.setLocalStateField('user', { name: nickname, color })
awareness.setLocalStateField('selection', selectedShapeIds)
awareness.setLocalStateField('drawing', { points, color, width }) // 진행 중인 펜 스트로크
```

Konva 별도 레이어에 렌더링:

- 커서: Konva.Arrow + Konva.Label (이름)
- 선택: 색상 테두리 (Konva.Rect outline)
- 진행 중 스트로크: Konva.Line (awareness에서 받은 points)

### 1-5. Whiteboard.svelte 교체

**수정:** `frontend/src/lib/components/Whiteboard.svelte`

기존 순수 Canvas 코드 → Konva.js 기반:

- `<div bind:this={konvaContainer}>` → `new Konva.Stage({ container })` 마운트
- 도구바 확장: 펜, 지우개, 직선, 사각형, 원, 텍스트, 선택 (7개)
- Undo/Redo: `yUndoManager.undo()` / `yUndoManager.redo()` + Ctrl+Z/Ctrl+Shift+Z
- 줌: 마우스 휠 → `stage.scaleX/Y` 조정
- 팬: 스페이스+드래그 또는 마우스 가운데 버튼
- **지우개 = 오브젝트 삭제** (클릭한 도형을 yShapes에서 제거, 영역 지우기 아님)
- **모달 닫힐 때**: `provider.destroy()`, awareness cleanup, 연결 해제

### 1-6. 스토어 업데이트

**수정:** `frontend/src/lib/stores/whiteboard.ts`

- `currentTool` 확장: `'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text' | 'select'`
- Y.js 레퍼런스: `ydoc`, `provider`, `awareness`, `yUndoManager`
- `whiteboardOpen`, `currentBoardId` 유지

---

## Phase 2: 기존 코드 정리 + 통합

### 2-1. 삭제

- `whiteboard.go` — Y.js relay가 대체
- `storage.go`의 `whiteboard_strokes`, `whiteboard_snapshots` 테이블 DROP

### 2-2. 수정 — 백엔드

- `room.go`: `whiteboard *WhiteboardHandler` 필드 제거, `"wb"` 액션 도메인 핸들러 제거
- `hub.go`: `newWhiteboardHandler()` 호출 제거
- `client.go`: `lastWbStroke` 필드 제거
- `storage.go`: `yjs_documents` 테이블 CREATE, 기존 whiteboard 테이블 DROP

### 2-3. 수정 — 프론트엔드

- `network.ts`: `onAction`의 `"wb"` 도메인 리스너 경로 정리 (더 이상 사용 안 함)
- `world.ts`: `onObjectInteract` 유지 (whiteboard 타입 → 모달 열림)
- boardId 흐름: `InteractiveObject.id` ("wb-1", "wb-2") → `currentBoardId` → Y.js WS URL

---

## 파일 변경 요약

### 신규 파일

| 파일                                                | Phase | 설명                                           |
| --------------------------------------------------- | ----- | ---------------------------------------------- |
| `yjs_relay.go`                                      | 0     | Y.js WebSocket 중계 + 프로토콜 핸들링 + 영속화 |
| `frontend/src/lib/whiteboard/yjs-doc.ts`            | 1     | Y.js 문서/Provider 생성                        |
| `frontend/src/lib/whiteboard/konva-yjs-binding.ts`  | 1     | Konva ↔ Y.js 양방향 바인딩                     |
| `frontend/src/lib/whiteboard/awareness-renderer.ts` | 1     | 협업 커서/선택/진행중 스트로크 렌더링          |

### 수정 파일

| 파일                   | Phase | 변경                                      |
| ---------------------- | ----- | ----------------------------------------- |
| `main.go`              | 0     | `/ws/yjs/{boardId}` + peer tunnel 라우팅  |
| `storage.go`           | 0,2   | yjs_documents 테이블, 기존 wb 테이블 DROP |
| `Whiteboard.svelte`    | 1     | Canvas API → Konva.js + Y.js 전면 교체    |
| `stores/whiteboard.ts` | 1     | 도구 확장, Y.js 레퍼런스                  |
| `room.go`              | 2     | whiteboard 필드/핸들러 제거               |
| `hub.go`               | 2     | whiteboard 초기화 제거                    |
| `client.go`            | 2     | lastWbStroke 필드 제거                    |
| `network.ts`           | 2     | wb 도메인 리스너 정리                     |

### 삭제 파일

| 파일            | Phase | 이유              |
| --------------- | ----- | ----------------- |
| `whiteboard.go` | 2     | Y.js relay가 대체 |

---

## 검증 전략

### Phase 0 스파이크

- 2개 브라우저 탭에서 Y.js 텍스트 문서 동기화 (Konva 없이 순수 Y.js)
- 빈 룸 접속 시 저장된 상태 복원
- 서버 재시작 후 상태 유지

### Phase 1 통합

- 2개 탭에서 동시 드로잉 → 양쪽 캔버스 동기화
- 펜 스트로크: awareness로 실시간 미리보기 → pointer-up 후 커밋
- Undo/Redo: 로컬 + 원격 모두 정상 동작
- 협업 커서: 상대방 마우스 위치 + 이름 표시

### Phase 2 정리

- 기존 wb 액션 경로 제거 확인 (Go build + Frontend build)
- SQLite 마이그레이션 (기존 테이블 DROP, 새 테이블 CREATE)

---

## ADR

**Decision:** Y.js (CRDT) + Konva.js (Canvas) + Go 바이트 중계 (with sync protocol)

**Drivers:** CRDT 충돌 해결, Vanilla JS 캔버스, 단일 서버

**Alternatives:** Fabric.js (무거움), 순수 Canvas (공수 과다), tldraw/Excalidraw (React 불가)

**Consequences:**

- Konva ↔ Y.js 바인딩 ~300-500 LOC 직접 구현
- Go에서 y-websocket 바이너리 프로토콜 일부 구현 (~200-250 LOC)
- 기존 화이트보드 데이터 영구 삭제
- 번들 사이즈 ~180KB 증가 (Konva 150KB + Y.js 30KB)

**Follow-ups:**

- Phase 0 스파이크 실패 시 Node.js y-websocket 사이드카 검토
- 이미지/파일 붙여넣기는 향후 확장 가능 (Y.js Doc에 blob 참조 추가)
