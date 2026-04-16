# Deep Interview Spec: 화이트보드 Y.js + Konva.js 리팩터링

> **Note (2026-04-16):** Go 백엔드는 Bun/TypeScript로 마이그레이션 완료됨. Go 참조는 역사적 맥락임.

## Metadata
- Interview ID: di-whiteboard-20260408
- Rounds: 7
- Final Ambiguity Score: 15%
- Type: brownfield
- Generated: 2026-04-08
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.85 | 0.25 | 0.213 |
| Success Criteria | 0.80 | 0.25 | 0.200 |
| Context Clarity | 0.80 | 0.15 | 0.120 |
| **Total Clarity** | | | **0.848** |
| **Ambiguity** | | | **15%** |

## Goal
현재 자체 구현된 화이트보드(순수 Canvas API + 커스텀 WebSocket 동기화)를 **Y.js (CRDT) + Konva.js (Canvas 라이브러리)**로 교체하여, 라이브러리 수준의 드로잉 품질과 충돌 없는 실시간 협업을 제공한다.

## Constraints
- **React 절대 불가** — tldraw/Excalidraw 배제, Vanilla JS 라이브러리만 사용
- **기존 Go 서버에 통합** — 별도 Node.js 서버 없이, Go가 Y.js WebSocket 바이트를 중계
- **기존 게임 월드 상호작용 유지** — Phaser 오브젝트 클릭 → 모달 패턴 유지
- **Svelte 5 네이티브** — Konva.js를 Svelte 컴포넌트로 감싸기
- **Y.js WebSocket Provider** — 프론트엔드에서 y-websocket 클라이언트 사용

## Non-Goals
- Excalidraw 수준의 풀 기능 (화살표, 프레임, 이미지 삽입, 라이브러리 등)
- 서버에서 보드 내용 직접 파싱/검증 (단순 중계)
- 오프라인 모드 / 로컬 퍼스트
- 레이어 시스템

## Acceptance Criteria

### 드로잉 도구
- [ ] 펜 (자유 곡선, 색상/굵기 선택 가능)
- [ ] 지우개 (오브젝트 삭제 또는 영역 지우기)
- [ ] 도형: 직선, 사각형, 원/타원
- [ ] 텍스트 입력 (클릭하여 텍스트 추가)
- [ ] 색상 팔레트 (최소 8색)
- [ ] 굵기 선택 (최소 3단계)

### 편집 기능
- [ ] Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
- [ ] 오브젝트 선택 및 이동
- [ ] 오브젝트 삭제 (선택 후 Delete)

### 협업 (Y.js CRDT)
- [ ] 실시간 동기화 — 다른 사용자의 그림이 즉시 반영
- [ ] 협업 커서 — 다른 사용자의 마우스 위치 표시
- [ ] 이름 표시 — 각 커서 옆에 사용자 닉네임 표시
- [ ] 선택 영역 공유 — 누가 어떤 오브젝트를 선택했는지 표시
- [ ] 충돌 없는 동시 편집 (CRDT가 자동 해결)

### 백엔드
- [ ] Go 서버에 `/ws/yjs/{boardId}` 엔드포인트 추가
- [ ] 같은 boardId의 클라이언트 간 Y.js 바이너리 메시지 중계
- [ ] Y.js 문서 상태 SQLite에 영속화 (주기적 스냅샷)
- [ ] 서버 재시작 후 보드 상태 복원

### UX
- [ ] 게임 월드 오브젝트 클릭/E키로 화이트보드 모달 열림
- [ ] 캔버스 줌/팬 지원
- [ ] 반응형 캔버스 크기 (모달 크기에 맞춤)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 자체 구현이면 충분 | 사용자가 라이브러리 활용 원함 | Y.js + Konva.js로 교체 |
| React 라이브러리 사용 가능 | React 절대 불가 | Vanilla JS 라이브러리만 |
| 별도 Y.js 서버 필요 | Go 서버에 중계 추가 | 동일 서버, 새 엔드포인트만 |
| Excalidraw 수준 필요 | Simplifier: 최소 세트 확인 | 펜+도형+텍스트+지우개+undo |
| 단순 동기화면 충분 | 풀 협업 UX 원함 | 커서+이름+선택 영역 |

## Technical Context
- **교체 대상**: whiteboard.go (Go 핸들러), Whiteboard.svelte (프론트엔드), stores/whiteboard.ts
- **유지**: room.go의 Room 구조, interactive-object.ts의 게임 오브젝트, hub.go의 Room 매니저
- **새 의존성 (Frontend)**: `yjs`, `y-websocket`, `konva`
- **새 엔드포인트 (Backend)**: `/ws/yjs/{boardId}` — Y.js WebSocket Provider 중계
- **영속화**: Y.js 문서 스냅샷을 SQLite에 주기적 저장 (기존 storage.go 활용)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Y.js Document | core | boardId, content, awareness | 1:1 with Board |
| Board | container | id, roomId | belongs to Room, has Y.js Doc |
| Stroke/Shape | data (Konva) | type, points, color, width | part of Y.js Doc |
| Text | data (Konva) | content, position, fontSize | part of Y.js Doc |
| Player/Cursor | collaboration | id, nickname, position, color | shown on Board |
| Selection | collaboration | playerId, objectIds | shown on Board |
| Konva Stage | rendering | width, height, zoom, offset | renders Y.js Doc |
| Y.js Provider | networking | url, boardId, awareness | syncs Y.js Doc |

## Interview Transcript
<details>
<summary>Full Q&A (7 rounds)</summary>

### Round 1
**Q:** Portal Space의 화이트보드는 어떤 상황에서 쓰이는 걸 상상하세요?
**A:** 복합적 — 업무/놀이/교육 모두.
**Ambiguity:** 72%

### Round 2
**Q:** 현재 화이트보드에서 가장 부족한 것은?
**A:** 잘 만들어진 라이브러리를 활용하고 싶다. CRDT(Conflict-free Replicated Data Types) 기반 협업.
**Ambiguity:** 61%

### Round 3
**Q:** React 의존성이 괜찮은가?
**A:** React는 죽어도 안 됨. → Y.js + Vanilla Canvas 라이브러리 방향 확정.
**Ambiguity:** 50%

### Round 4 (Contrarian)
**Q:** Excalidraw 수준의 풀 기능이 필요한가?
**A:** 펜 + 도형 + 텍스트 + 지우개 + undo/redo가 최소 세트.
**Ambiguity:** 38%

### Round 5
**Q:** Canvas 라이브러리 선택은?
**A:** Y.js + Konva.js.
**Ambiguity:** 30%

### Round 6 (Simplifier)
**Q:** 협업 UX는 어디까지?
**A:** 커서 + 이름 + 선택 영역 공유 (풀 세트).
**Ambiguity:** 22%

### Round 7
**Q:** 백엔드 아키텍처는?
**A:** Go 서버에 Y.js WebSocket 중계 엔드포인트 추가. 서버 추가 없음.
**Ambiguity:** 15%

</details>
