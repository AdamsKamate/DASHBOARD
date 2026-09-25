import type { Position, WidgetInstance } from "../types";

// Grid layout logic.

/* Number of columns of the reference (desktop) grid. Stored positions use it. */
export const GRID_COLUMNS = 12;

/* Smallest size a block can be resized to, in grid units. */
export const MIN_BLOCK_WIDTH = 2;
export const MIN_BLOCK_HEIGHT = 2;

/* Size given to a newly added block. */
export const NEW_BLOCK_WIDTH = 4;
export const NEW_BLOCK_HEIGHT = 2;

/* An item in the format react grid layout expects. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface PositionChange {
  widgetId: string;
  position: Position;
}

export function toGridItem(widget: WidgetInstance): GridItem {
  return {
    i: widget.id,
    x: widget.position.x,
    y: widget.position.y,
    w: widget.position.w,
    h: widget.position.h,
    minW: MIN_BLOCK_WIDTH,
    minH: MIN_BLOCK_HEIGHT,
  };
}

function samePosition(position: Position, item: GridItem): boolean {
  return (
    position.x === item.x &&
    position.y === item.y &&
    position.w === item.w &&
    position.h === item.h
  );
}

/*
 Lists the widgets whose position differs from the new layout.
 */
export function findChangedPositions(
  widgets: WidgetInstance[],
  layout: GridItem[]
): PositionChange[] {
  const itemsById = new Map(layout.map((item) => [item.i, item]));
  const changes: PositionChange[] = [];

  for (const widget of widgets) {
    const item = itemsById.get(widget.id);
    if (item && !samePosition(widget.position, item)) {
      changes.push({
        widgetId: widget.id,
        position: { x: item.x, y: item.y, w: item.w, h: item.h },
      });
    }
  }
  return changes;
}

/* Returns a new list with the given positions applied. Never mutates. */
export function applyPositionChanges(
  widgets: WidgetInstance[],
  changes: PositionChange[]
): WidgetInstance[] {
  const newPositionById = new Map(changes.map((change) => [change.widgetId, change.position]));

  return widgets.map((widget) => {
    const newPosition = newPositionById.get(widget.id);
    return newPosition ? { ...widget, position: newPosition } : widget;
  });
}

/*
 Where to put a new block: on a new row below everything else.
 */
export function findFreePosition(widgets: WidgetInstance[]): Position {
  const lowestBottomEdge = widgets.reduce(
    (bottom, widget) => Math.max(bottom, widget.position.y + widget.position.h),
    0
  );
  return { x: 0, y: lowestBottomEdge, w: NEW_BLOCK_WIDTH, h: NEW_BLOCK_HEIGHT };
}
