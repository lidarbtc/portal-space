import Konva from 'konva';
import * as Y from 'yjs';

export type ShapeType = 'freehand' | 'line' | 'rect' | 'circle' | 'text';

export interface ShapeData {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  points?: number[];
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  fontSize?: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

const MAX_TEXT_LENGTH = 500;

let shapeIdCounter = 0;
export function generateShapeId(): string {
  return `s_${Date.now()}_${shapeIdCounter++}`;
}

/**
 * Create a Konva node from a Y.Map shape definition.
 */
export function createKonvaNode(shapeMap: Y.Map<unknown>, layer: Konva.Layer): Konva.Shape | Konva.Group | null {
  const type = shapeMap.get('type') as ShapeType;
  const id = shapeMap.get('id') as string;
  const x = (shapeMap.get('x') as number) ?? 0;
  const y = (shapeMap.get('y') as number) ?? 0;
  const stroke = (shapeMap.get('stroke') as string) ?? '#ffffff';
  const strokeWidth = (shapeMap.get('strokeWidth') as number) ?? 3;

  let node: Konva.Shape | null = null;

  switch (type) {
    case 'freehand': {
      const points = (shapeMap.get('points') as number[]) ?? [];
      node = new Konva.Line({
        id, x: 0, y: 0, points, stroke, strokeWidth,
        lineCap: 'round', lineJoin: 'round',
        tension: 0.3,
        globalCompositeOperation: stroke === 'eraser' ? 'destination-out' : 'source-over',
      });
      break;
    }
    case 'line': {
      const points = (shapeMap.get('points') as number[]) ?? [];
      node = new Konva.Line({
        id, x: 0, y: 0, points, stroke, strokeWidth,
        lineCap: 'round',
      });
      break;
    }
    case 'rect': {
      const width = (shapeMap.get('width') as number) ?? 100;
      const height = (shapeMap.get('height') as number) ?? 100;
      node = new Konva.Rect({
        id, x, y, width, height, stroke, strokeWidth,
        fill: (shapeMap.get('fill') as string) ?? undefined,
        cornerRadius: 2,
      });
      break;
    }
    case 'circle': {
      const radius = (shapeMap.get('radius') as number) ?? 50;
      node = new Konva.Circle({
        id, x, y, radius, stroke, strokeWidth,
        fill: (shapeMap.get('fill') as string) ?? undefined,
      });
      break;
    }
    case 'text': {
      const rawText = (shapeMap.get('text') as string) ?? '';
      const text = rawText.slice(0, MAX_TEXT_LENGTH);
      const fontSize = (shapeMap.get('fontSize') as number) ?? 18;
      node = new Konva.Text({
        id, x, y, text, fontSize,
        fill: stroke,
        fontFamily: 'MulmaruMono, monospace',
      });
      break;
    }
  }

  if (node) {
    node.draggable(true);
    layer.add(node);
  }

  return node;
}

/**
 * Bind Y.js shapes array to a Konva layer.
 * Returns a cleanup function.
 */
export function bindYjsToKonva(
  yShapes: Y.Array<Y.Map<unknown>>,
  layer: Konva.Layer,
  onShapeSelect?: (id: string | null) => void
): () => void {
  const nodeMap = new Map<string, Konva.Shape | Konva.Group>();

  // Initial render
  yShapes.forEach((shapeMap) => {
    const id = shapeMap.get('id') as string;
    const node = createKonvaNode(shapeMap, layer);
    if (node && id) {
      nodeMap.set(id, node);
      attachNodeEvents(node, shapeMap, onShapeSelect);
    }
  });
  layer.batchDraw();

  // Observe Y.js changes
  const observer = (event: Y.YArrayEvent<Y.Map<unknown>>) => {
    let index = 0;
    for (const delta of event.changes.delta) {
      if (delta.retain) {
        index += delta.retain;
      }
      if (delta.delete) {
        // Find and remove deleted shapes
        for (let i = 0; i < delta.delete; i++) {
          // We need to find which shapes were removed
          // Y.js doesn't directly tell us the old values in delta
        }
      }
      if (delta.insert) {
        for (const item of delta.insert as Y.Map<unknown>[]) {
          const id = item.get('id') as string;
          if (id && !nodeMap.has(id)) {
            const node = createKonvaNode(item, layer);
            if (node) {
              nodeMap.set(id, node);
              attachNodeEvents(node, item, onShapeSelect);
            }
          }
        }
      }
    }

    // Reconcile: remove nodes not in yShapes
    const currentIds = new Set<string>();
    yShapes.forEach((m) => currentIds.add(m.get('id') as string));
    for (const [id, node] of nodeMap) {
      if (!currentIds.has(id)) {
        node.destroy();
        nodeMap.delete(id);
      }
    }

    layer.batchDraw();
  };

  yShapes.observe(observer);

  // Observe individual shape property changes
  const shapeObservers = new Map<Y.Map<unknown>, () => void>();

  function observeShapeMap(shapeMap: Y.Map<unknown>) {
    const handler = () => {
      const id = shapeMap.get('id') as string;
      const existing = nodeMap.get(id);
      if (!existing) return;

      // Update node properties from Y.Map
      const type = shapeMap.get('type') as ShapeType;
      if (type === 'freehand' || type === 'line') {
        (existing as Konva.Line).points((shapeMap.get('points') as number[]) ?? []);
      } else if (type === 'rect') {
        existing.setAttrs({
          x: shapeMap.get('x'), y: shapeMap.get('y'),
          width: shapeMap.get('width'), height: shapeMap.get('height'),
        });
      } else if (type === 'circle') {
        existing.setAttrs({
          x: shapeMap.get('x'), y: shapeMap.get('y'),
          radius: shapeMap.get('radius'),
        });
      } else if (type === 'text') {
        existing.setAttrs({
          x: shapeMap.get('x'), y: shapeMap.get('y'),
          text: shapeMap.get('text'),
        });
      }
      layer.batchDraw();
    };
    shapeMap.observe(handler);
    shapeObservers.set(shapeMap, () => shapeMap.unobserve(handler));
  }

  yShapes.forEach(observeShapeMap);

  // Also observe new shapes added later
  const insertObserver = (event: Y.YArrayEvent<Y.Map<unknown>>) => {
    for (const delta of event.changes.delta) {
      if (delta.insert) {
        for (const item of delta.insert as Y.Map<unknown>[]) {
          observeShapeMap(item);
        }
      }
    }
  };
  yShapes.observe(insertObserver);

  return () => {
    yShapes.unobserve(observer);
    yShapes.unobserve(insertObserver);
    for (const unsub of shapeObservers.values()) unsub();
    for (const node of nodeMap.values()) node.destroy();
    nodeMap.clear();
  };
}

function attachNodeEvents(
  node: Konva.Shape | Konva.Group,
  shapeMap: Y.Map<unknown>,
  onShapeSelect?: (id: string | null) => void
) {
  node.on('dragend', () => {
    shapeMap.set('x', node.x());
    shapeMap.set('y', node.y());
  });

  node.on('click tap', () => {
    const id = shapeMap.get('id') as string;
    onShapeSelect?.(id);
  });
}

/**
 * Add a shape to the Y.js document.
 */
export function addShape(yShapes: Y.Array<Y.Map<unknown>>, data: ShapeData): void {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      map.set(key, value);
    }
  }
  yShapes.push([map]);
}

/**
 * Remove a shape from the Y.js document by ID.
 */
export function removeShape(yShapes: Y.Array<Y.Map<unknown>>, shapeId: string): void {
  for (let i = 0; i < yShapes.length; i++) {
    const map = yShapes.get(i);
    if (map.get('id') === shapeId) {
      yShapes.delete(i, 1);
      return;
    }
  }
}
