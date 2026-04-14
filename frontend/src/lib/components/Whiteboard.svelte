<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { onDestroy } from 'svelte';
  import Konva from 'konva';
  import {
    whiteboardOpen,
    currentBoardId,
    currentTool,
    penColor,
    penWidth,
    activeDoc,
    type WhiteboardTool
  } from '$lib/stores/whiteboard';
  import { selfId, players } from '$lib/stores/game';
  import { get } from 'svelte/store';
  import { createWhiteboardDoc, type WhiteboardDoc } from '$lib/whiteboard/yjs-doc';
  import {
    bindYjsToKonva,
    addShape,
    removeShape,
    generateShapeId,
    type ShapeType,
    type BindingHandle
  } from '$lib/whiteboard/konva-yjs-binding';
  import {
    createAwarenessRenderer,
    updateLocalCursor,
    updateLocalDrawing
  } from '$lib/whiteboard/awareness-renderer';

  let konvaContainer: HTMLDivElement | undefined = $state(undefined);
  let stage: Konva.Stage | null = $state(null);
  let drawLayer: Konva.Layer | null = $state(null);
  let awarenessLayer: Konva.Layer | null = $state(null);
  let doc: WhiteboardDoc | null = $state(null);
  let bindingHandle: BindingHandle | null = null;
  let cleanupAwareness: (() => void) | null = null;

  let isDrawing = $state(false);
  let currentPoints: number[] = $state([]);
  let drawPreview: Konva.Shape | null = null;
  let selectedShapeId: string | null = $state(null);
  let shapeStartPos = { x: 0, y: 0 };
  let isPanning = $state(false);
  let spaceHeld = $state(false);
  let panStart = { x: 0, y: 0 };

  const colors = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
  const widths = [2, 4, 8];
  const tools: { id: WhiteboardTool; label: string }[] = [
    { id: 'select', label: '선택' },
    { id: 'pen', label: '펜' },
    { id: 'eraser', label: '지우개' },
    { id: 'line', label: '직선' },
    { id: 'rect', label: '사각형' },
    { id: 'circle', label: '원' },
    { id: 'text', label: '텍스트' },
  ];

  function initKonva() {
    if (!konvaContainer) return;

    // Infinite canvas — size to container, no fixed bounds
    const rect = konvaContainer.getBoundingClientRect();
    stage = new Konva.Stage({
      container: konvaContainer,
      width: rect.width || 800,
      height: rect.height || 600,
    });

    // Drawing layer (infinite — no background rect needed)
    drawLayer = new Konva.Layer();
    stage.add(drawLayer);

    // Awareness layer (cursors, in-progress strokes)
    awarenessLayer = new Konva.Layer();
    stage.add(awarenessLayer);

    // Mouse events on stage
    stage.on('pointerdown', (e) => {
      if (spaceHeld) {
        // Start panning
        isPanning = true;
        const pos = stage!.getPointerPosition()!;
        panStart = { x: pos.x - stage!.x(), y: pos.y - stage!.y() };
        return;
      }
      handlePointerDown(e);
    });
    stage.on('pointermove', (e) => {
      if (isPanning && stage) {
        const pos = stage.getPointerPosition()!;
        stage.position({ x: pos.x - panStart.x, y: pos.y - panStart.y });
        return;
      }
      handlePointerMove(e);
    });
    stage.on('pointerup', (e) => {
      if (isPanning) {
        isPanning = false;
        return;
      }
      handlePointerUp(e);
    });

    // Zoom with mouse wheel (centered on cursor)
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const oldScale = stage!.scaleX();
      const pointer = stage!.getPointerPosition()!;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      const newScale = direction > 0 ? oldScale * factor : oldScale / factor;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));

      const mousePointTo = {
        x: (pointer.x - stage!.x()) / oldScale,
        y: (pointer.y - stage!.y()) / oldScale,
      };
      stage!.scale({ x: clampedScale, y: clampedScale });
      stage!.position({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    });

    // Resize stage when container resizes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (stage) {
          stage.width(entry.contentRect.width);
          stage.height(entry.contentRect.height);
        }
      }
    });
    resizeObserver.observe(konvaContainer);
  }

  function connectYjs(boardId: string) {
    const myId = get(selfId);
    const playerMap = get(players);
    const myInfo = myId ? playerMap.get(myId) : null;
    const nickname = myInfo?.nickname ?? 'anonymous';
    const color = myInfo?.colors?.body ?? '#6366f1';

    doc = createWhiteboardDoc(boardId, nickname, color);
    activeDoc.set(doc);

    if (drawLayer) {
      bindingHandle = bindYjsToKonva(
        doc.yShapes,
        drawLayer,
        (id) => { selectedShapeId = id; },
        () => get(currentTool) === 'select',
        doc.provider
      );
    }

    if (awarenessLayer) {
      cleanupAwareness = createAwarenessRenderer(
        doc.awareness,
        awarenessLayer,
        doc.ydoc.clientID
      );
    }
  }

  function getStagePoint(e: Konva.KonvaEventObject<PointerEvent>): { x: number; y: number } {
    const transform = stage!.getAbsoluteTransform().copy().invert();
    const pos = stage!.getPointerPosition()!;
    return transform.point(pos);
  }

  function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!doc || !drawLayer) return;
    const tool = get(currentTool);
    const pt = getStagePoint(e);

    if (tool === 'select') {
      // Selection handled by node click events
      return;
    }

    if (tool === 'text') {
      const text = prompt('텍스트 입력:');
      if (text) {
        addShape(doc.yShapes, {
          id: generateShapeId(),
          type: 'text',
          x: pt.x, y: pt.y,
          text,
          fontSize: 18,
          stroke: get(penColor),
          strokeWidth: get(penWidth),
        });
      }
      return;
    }

    if (tool === 'eraser') {
      // Find shape under cursor and delete
      const shape = drawLayer.getIntersection(stage!.getPointerPosition()!);
      if (shape && shape.id()) {
        removeShape(doc.yShapes, shape.id());
      }
      return;
    }

    isDrawing = true;
    shapeStartPos = { x: pt.x, y: pt.y };

    if (tool === 'pen') {
      currentPoints = [pt.x, pt.y];
      drawPreview = new Konva.Line({
        points: currentPoints,
        stroke: get(penColor),
        strokeWidth: get(penWidth),
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.3,
      });
      drawLayer.add(drawPreview);
    } else if (tool === 'line') {
      currentPoints = [pt.x, pt.y, pt.x, pt.y];
      drawPreview = new Konva.Line({
        points: currentPoints,
        stroke: get(penColor),
        strokeWidth: get(penWidth),
        lineCap: 'round',
      });
      drawLayer.add(drawPreview);
    } else if (tool === 'rect') {
      drawPreview = new Konva.Rect({
        x: pt.x, y: pt.y, width: 0, height: 0,
        stroke: get(penColor),
        strokeWidth: get(penWidth),
      });
      drawLayer.add(drawPreview);
    } else if (tool === 'circle') {
      drawPreview = new Konva.Circle({
        x: pt.x, y: pt.y, radius: 0,
        stroke: get(penColor),
        strokeWidth: get(penWidth),
      });
      drawLayer.add(drawPreview);
    }
  }

  function handlePointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!doc || !stage) return;
    const pt = getStagePoint(e);

    // Update awareness cursor
    updateLocalCursor(doc.awareness, pt.x, pt.y);

    if (!isDrawing || !drawPreview) return;
    const tool = get(currentTool);

    if (tool === 'pen') {
      currentPoints = [...currentPoints, pt.x, pt.y];
      (drawPreview as Konva.Line).points(currentPoints);
      // Broadcast ephemeral drawing
      updateLocalDrawing(doc.awareness, {
        points: currentPoints,
        color: get(penColor),
        width: get(penWidth),
      });
    } else if (tool === 'line') {
      currentPoints = [shapeStartPos.x, shapeStartPos.y, pt.x, pt.y];
      (drawPreview as Konva.Line).points(currentPoints);
    } else if (tool === 'rect') {
      const w = pt.x - shapeStartPos.x;
      const h = pt.y - shapeStartPos.y;
      drawPreview.setAttrs({
        x: w < 0 ? pt.x : shapeStartPos.x,
        y: h < 0 ? pt.y : shapeStartPos.y,
        width: Math.abs(w),
        height: Math.abs(h),
      });
    } else if (tool === 'circle') {
      const dx = pt.x - shapeStartPos.x;
      const dy = pt.y - shapeStartPos.y;
      (drawPreview as Konva.Circle).radius(Math.sqrt(dx * dx + dy * dy));
    }

    drawLayer?.batchDraw();
  }

  function handlePointerUp(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!isDrawing || !doc || !drawPreview) {
      isDrawing = false;
      return;
    }
    isDrawing = false;

    const tool = get(currentTool);
    const color = get(penColor);
    const width = get(penWidth);
    const endPt = getStagePoint(e);

    // Capture dimensions from preview BEFORE destroying
    const previewAttrs = drawPreview.getAttrs();

    // Remove preview
    drawPreview.destroy();
    drawPreview = null;
    drawLayer?.batchDraw();

    // Clear ephemeral drawing
    updateLocalDrawing(doc.awareness, null);

    // Commit to Y.js
    if (tool === 'pen' && currentPoints.length >= 4) {
      addShape(doc.yShapes, {
        id: generateShapeId(),
        type: 'freehand',
        x: 0, y: 0,
        points: currentPoints,
        stroke: color,
        strokeWidth: width,
      });
    } else if (tool === 'line' && currentPoints.length === 4) {
      addShape(doc.yShapes, {
        id: generateShapeId(),
        type: 'line',
        x: 0, y: 0,
        points: currentPoints,
        stroke: color,
        strokeWidth: width,
      });
    } else if (tool === 'rect') {
      const w = endPt.x - shapeStartPos.x;
      const h = endPt.y - shapeStartPos.y;
      if (Math.abs(w) > 2 && Math.abs(h) > 2) {
        addShape(doc.yShapes, {
          id: generateShapeId(),
          type: 'rect',
          x: w < 0 ? endPt.x : shapeStartPos.x,
          y: h < 0 ? endPt.y : shapeStartPos.y,
          width: Math.abs(w),
          height: Math.abs(h),
          stroke: color,
          strokeWidth: width,
        });
      }
    } else if (tool === 'circle') {
      const dx = endPt.x - shapeStartPos.x;
      const dy = endPt.y - shapeStartPos.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > 2) {
        addShape(doc.yShapes, {
          id: generateShapeId(),
          type: 'circle',
          x: shapeStartPos.x,
          y: shapeStartPos.y,
          radius,
          stroke: color,
          strokeWidth: width,
        });
      }
    }

    currentPoints = [];
  }

  function handleUndo() {
    doc?.undoManager.undo();
  }

  function handleRedo() {
    doc?.undoManager.redo();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!$whiteboardOpen) return;
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      spaceHeld = true;
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedShapeId && doc) {
        removeShape(doc.yShapes, selectedShapeId);
        selectedShapeId = null;
      }
    }
  }

  function handleKeyup(e: KeyboardEvent) {
    if (!$whiteboardOpen) return;
    if (e.key === ' ') {
      spaceHeld = false;
      isPanning = false;
    }
  }

  function close() {
    // Cleanup
    bindingHandle?.cleanup();
    bindingHandle = null;
    cleanupAwareness?.();
    cleanupAwareness = null;
    doc?.destroy();
    doc = null;
    activeDoc.set(null);
    stage?.destroy();
    stage = null;
    drawLayer = null;
    awarenessLayer = null;
    selectedShapeId = null;

    whiteboardOpen.set(false);
    currentBoardId.set(null);
  }

  $effect(() => {
    const tool = $currentTool;
    bindingHandle?.setAllDraggable(tool === 'select');
  });

  $effect(() => {
    const boardId = $currentBoardId;
    if (boardId && $whiteboardOpen && konvaContainer) {
      setTimeout(() => {
        initKonva();
        connectYjs(boardId);
      }, 50);
    }
  });

  onDestroy(() => {
    bindingHandle?.cleanup();
    cleanupAwareness?.();
    doc?.destroy();
    stage?.destroy();
  });
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<Dialog.Root
  bind:open={$whiteboardOpen}
  onOpenChange={(open) => { if (!open) close(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="wb-overlay" />
    <Dialog.Content class="wb-content">
      <div class="wb-header">
        <Dialog.Title class="wb-title">화이트보드</Dialog.Title>
        <div class="wb-header-actions">
          <button onclick={handleUndo} class="wb-action-btn" aria-label="Undo">↩</button>
          <button onclick={handleRedo} class="wb-action-btn" aria-label="Redo">↪</button>
          <button onclick={close} class="wb-close-btn">✕</button>
        </div>
      </div>

      <div class="wb-toolbar">
        {#each tools as tool (tool.id)}
          <button
            class="wb-tool-btn"
            class:active={$currentTool === tool.id}
            onclick={() => currentTool.set(tool.id)}
          >{tool.label}</button>
        {/each}

        <div class="wb-divider"></div>

        {#each colors as color (color)}
          <button
            class="wb-color-btn"
            class:selected={$penColor === color}
            style="background-color: {color}"
            onclick={() => penColor.set(color)}
            aria-label="색상 {color}"
          ></button>
        {/each}

        <div class="wb-divider"></div>

        {#each widths as w (w)}
          <button
            class="wb-width-btn"
            class:active={$penWidth === w}
            onclick={() => penWidth.set(w)}
            aria-label="펜 굵기 {w}px"
          >
            <div class="wb-width-dot" style="width: {w + 2}px; height: {w + 2}px"></div>
          </button>
        {/each}
      </div>

      <div class="wb-canvas-wrap">
        <div
          bind:this={konvaContainer}
          class="wb-konva"
          style="cursor: {spaceHeld ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'};"
        ></div>
      </div>

      <Dialog.Description class="wb-sr-only">
        협업 화이트보드 - Y.js CRDT 기반 실시간 협업
      </Dialog.Description>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.wb-overlay) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.8);
  }

  :global(.wb-content) {
    position: fixed;
    inset: 48px;
    z-index: 201;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    background: #1a1a2e;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  @media (min-width: 960px) {
    :global(.wb-content) {
      right: 352px; /* 320px chat-panel + 32px margin */
    }
  }

  :global(.wb-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
  }

  :global(.wb-title) {
    font-family: 'MulmaruMono', monospace;
    font-size: 14px;
    color: #a5b4fc;
    margin: 0;
  }

  :global(.wb-header-actions) {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  :global(.wb-action-btn) {
    background: rgba(255, 255, 255, 0.05);
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
  }
  :global(.wb-action-btn:hover) {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  :global(.wb-close-btn) {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 16px;
  }
  :global(.wb-close-btn:hover) {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  :global(.wb-toolbar) {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
    flex-wrap: wrap;
  }

  :global(.wb-tool-btn) {
    font-family: 'MulmaruMono', monospace;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    color: #9ca3af;
    transition: all 0.15s;
  }
  :global(.wb-tool-btn.active) {
    background: #4f46e5;
    color: white;
  }

  :global(.wb-divider) {
    width: 1px;
    height: 16px;
    background: rgba(99, 102, 241, 0.2);
    margin: 0 2px;
  }

  :global(.wb-color-btn) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s;
  }
  :global(.wb-color-btn:hover) {
    transform: scale(1.15);
  }
  :global(.wb-color-btn.selected) {
    border-color: white;
  }

  :global(.wb-width-btn) {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    transition: all 0.15s;
  }
  :global(.wb-width-btn.active) {
    background: #4f46e5;
  }

  :global(.wb-width-dot) {
    border-radius: 50%;
    background: white;
  }

  :global(.wb-canvas-wrap) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #16162a;
  }

  :global(.wb-konva) {
    width: 100%;
    height: 100%;
  }

  :global(.wb-sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
