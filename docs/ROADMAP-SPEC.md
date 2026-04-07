# Deep Interview Spec: Portal Space 로드맵

## Metadata
- Interview ID: di-roadmap-20260407
- Rounds: 9
- Final Ambiguity Score: 15%
- Type: brownfield
- Generated: 2026-04-08
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.35 | 0.322 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.75 | 0.15 | 0.113 |
| **Total Clarity** | | | **0.848** |
| **Ambiguity** | | | **15%** |

## Goal
Portal Space를 **개발자 가상 오피스 + 소셜 커뮤니티 공간**으로 발전시키기 위한 우선순위 기반 기능 로드맵. 핵심 경험은 "같이 일하는 것"이며, 부차적으로 소셜 상호작용과 세계관 확장을 추구한다.

## Constraints
- **인력:** 소규모 (1인 또는 소수 개발자로 추정)
- **타임라인:** 없음 — 우선순위 기반으로 순서대로 진행
- **기술 스택:** Go 백엔드 + Svelte 5/SvelteKit + Phaser 3 프론트엔드
- **UI 접근법:** 하이브리드 — 게임 월드 내 오브젝트 클릭으로 진입, Svelte UI 패널에서 실제 작업
- **현재 인프라:** WebSocket 실시간 동기화, 60x45 타일맵, 최대 20명 동시접속

## Non-Goals
- 코드 공유/페어프로그래밍 (현 단계에서 제외)
- 화면공유/음성통화 (현 단계에서 제외)
- NPC/이벤트 시스템 (현 단계에서 제외)
- 코드 리뷰 도구 (현 단계에서 제외)

## Acceptance Criteria (로드맵 항목별)

### Priority 1: 화이트보드/칠판 (하이브리드 UI)
- [ ] 게임 월드 내 칠판 오브젝트가 존재하고 클릭 가능
- [ ] 클릭 시 Svelte UI 패널로 화이트보드 열림
- [ ] 실시간 멀티플레이어 드로잉 지원 (WebSocket 동기화)
- [ ] 기본 도구: 펜, 지우개, 색상, 텍스트
- [ ] 보드 내용 저장/불러오기

### Priority 2: 맵/방 다양화
- [ ] 기본 맵 외 추가 테마 맵 최소 2개 이상
- [ ] 맵 간 이동 (포탈/문) 시스템
- [ ] 각 맵마다 고유한 시각적 테마와 오브젝트
- [ ] 새 맵 추가가 용이한 데이터 주도 구조

### Priority 3: 미니게임/액티비티
- [ ] 월드 내에서 접근 가능한 미니게임 최소 1개
- [ ] 멀티플레이어 대전 또는 협동 가능
- [ ] 게임 결과가 다른 플레이어에게 공유됨

### Priority 4: 공유 콘텐츠 (함께 보기)
- [ ] URL 기반 콘텐츠 공유 (동영상, 음악, 링크)
- [ ] 같은 공간의 플레이어가 동기화된 콘텐츠 시청 가능
- [ ] 재생 제어 (재생/일시정지/탐색) 동기화

### Priority 5: 가구/장식 커스터마이징
- [ ] 사용자가 자기 공간에 가구/장식 배치 가능
- [ ] 가구 아이템 카탈로그 (최소 10종)
- [ ] 드래그 앤 드롭 또는 그리드 기반 배치

### Priority 6: 프로젝트 관리보드
- [ ] 월드 내 보드 오브젝트 클릭으로 진입
- [ ] 칸반 스타일 태스크 보드
- [ ] 실시간 멀티플레이어 편집 지원
- [ ] 태스크 생성/수정/삭제/이동

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 세 영역(업무/상호작용/세계관)을 동시 추구 | Contrarian: 하나만 완벽히 한다면? | 업무 도구 우선, 나머지는 순차 |
| 도구는 별도 UI로 구현 | Simplifier: 월드 내 vs UI 패널? | 하이브리드 (오브젝트 진입 → UI 패널) |
| 프로젝트 관리가 코어 업무 도구 | 우선순위 재정렬 | 6순위로 하락, 맵 다양화가 2순위 |
| 개발자 오피스가 핵심 정체성 | 3순위 중 선택 | 업무 도구 우선이지만 세계관도 중요 |

## Technical Context
- **백엔드:** Go 1.26.1 + gorilla/websocket (실시간 동기화 인프라 존재)
- **프론트엔드:** Svelte 5 + Phaser 3 (게임 렌더링 + UI 컴포넌트 분리 구조)
- **하이브리드 UI 구현:** Phaser 오브젝트의 상호작용 이벤트 → Svelte 컴포넌트 마운트 (기존 설정 모달 패턴 활용 가능)
- **맵 시스템:** 현재 60x45 단일 타일맵 → 멀티 맵 + 포탈 시스템으로 확장 필요
- **WebSocket 메시지:** 새로운 메시지 타입 추가 필요 (드로잉, 보드 업데이트, 게임 이벤트 등)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Portal Space | core domain | name, version, config | contains Maps, has Players |
| Player/User | core domain | nickname, avatar, status, position | belongs to Map, owns Furniture |
| Map/Room | core domain | theme, tiles, size, objects | contains Players, has Portal links |
| Whiteboard | tool (P1) | content, participants, history | placed in Map, used by Players |
| Project Board | tool (P6) | tasks, columns, members | placed in Map, used by Players |
| Mini Game | interaction (P3) | type, rules, state | hosted in Map, played by Players |
| Shared Content | interaction (P4) | url, type, playback_state | viewed by Players in Map |
| Furniture/Decoration | customization (P5) | type, position, owner | placed in Map, owned by Player |
| Avatar | customization | type, colors, parts | belongs to Player |
| Chat Message | communication | text, sender, radius | sent by Player in Map |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 5 | 0 | 0 | 5 | 100% |
| 3 | 8 | 3 | 0 | 5 | 62.5% |
| 4 | 8 | 0 | 1 | 7 | 87.5% |
| 5 | 10 | 2 | 0 | 8 | 80% |
| 6 | 10 | 0 | 0 | 10 | 100% |
| 7 | 12 | 2 | 0 | 10 | 83% |
| 8 | 14 | 2 | 0 | 12 | 85.7% |
| 9 | 14 | 0 | 0 | 14 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (9 rounds)</summary>

### Round 1
**Q:** Portal Space를 앞으로 어떤 제품으로 만들고 싶으신가요?
**A:** 1~2번(개발자 가상 오피스 + 소셜/커뮤니티 공간)이 합쳐져 있다고 생각해.
**Ambiguity:** 73% (Goal: 0.50, Constraints: 0.10, Criteria: 0.10, Context: 0.30)

### Round 2
**Q:** 로드맵의 시간 범위는 어느 정도? 인력은?
**A:** 타임라인 없이 우선순위만.
**Ambiguity:** 66% (Goal: 0.50, Constraints: 0.35, Criteria: 0.10, Context: 0.35)

### Round 3
**Q:** 누군가에게 보여줬을 때 '쓰고 싶다'고 느끼게 하려면 가장 부족한 것은?
**A:** 상호작용 부족, 업무 도구 부재, 세계관/콘텐츠 부족 — 세 가지 다.
**Ambiguity:** 56% (Goal: 0.55, Constraints: 0.35, Criteria: 0.40, Context: 0.40)

### Round 4 (🔥 Contrarian Mode)
**Q:** 세 가지 중 하나만 완벽하게 해결할 수 있다면? 핵심 경험이 뭔가요?
**A:** 업무 도구 우선.
**Ambiguity:** 46% (Goal: 0.70, Constraints: 0.50, Criteria: 0.40, Context: 0.45)

### Round 5
**Q:** 구체적으로 어떤 업무 도구가 있어야 하나요? Top 3?
**A:** 화이트보드/칠판, 프로젝트 관리.
**Ambiguity:** 39% (Goal: 0.75, Constraints: 0.50, Criteria: 0.60, Context: 0.50)

### Round 6 (✨ Simplifier Mode)
**Q:** 도구를 게임 월드 내 오브젝트로? 별도 UI 패널로? 하이브리드?
**A:** 하이브리드.
**Ambiguity:** 33% (Goal: 0.80, Constraints: 0.60, Criteria: 0.60, Context: 0.60)

### Round 7
**Q:** '상호작용 부족'은 구체적으로 어떤 종류의 상호작용?
**A:** 미니게임/액티비티, 공유 콘텐츠 (함께 보기).
**Ambiguity:** 28% (Goal: 0.85, Constraints: 0.60, Criteria: 0.70, Context: 0.65)

### Round 8
**Q:** 세계관/콘텐츠 부족은 구체적으로?
**A:** 맵/방 다양화, 가구/장식 커스터마이징.
**Ambiguity:** 22% (Goal: 0.92, Constraints: 0.65, Criteria: 0.80, Context: 0.70)

### Round 9
**Q:** 기능 우선순위 순서가 맞나요?
**A:** 1-5-3-4-6-2 순서로 재정렬. (화이트보드 → 맵다양화 → 미니게임 → 공유콘텐츠 → 가구 → 프로젝트관리)
**Ambiguity:** 15% (Goal: 0.92, Constraints: 0.80, Criteria: 0.85, Context: 0.75)

</details>
