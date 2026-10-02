import type { Position, WidgetInstance } from "../types";

// Grid layout logic

/* Number of columns of the reference (desktop) grid. Stored positions use it. */
export const GRID_COLUMNS = 12;

/* Smallest size a block can be resized to, in grid units. */
export const MIN_BLOCK_WIDTH = 2;
export const MIN_BLOCK_HEIGHT = 2;

/* Size given to a newly added block. */
export const NEW_BLOCK_WIDTH = 4;
export const NEW_BLOCK_HEIGHT = 3;

/* A block placed on the grid. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
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
  };
}

// Collisions

/* Two blocks overlap when they share at least one cell. */
export function itemsOverlap(first: GridItem, second: GridItem): boolean {
  if (first.i === second.i) {
    return false;
  }
  const noHorizontalOverlap = first.x + first.w <= second.x || second.x + second.w <= first.x;
  const noVerticalOverlap = first.y + first.h <= second.y || second.y + second.h <= first.y;
  return !noHorizontalOverlap && !noVerticalOverlap;
}

function findOverlappingItems(items: GridItem[], candidate: GridItem): GridItem[] {
  return items.filter((item) => itemsOverlap(item, candidate));
}

/*
 Keeps a block inside the grid.
 */
export function clampToGrid(item: GridItem, columnCount = GRID_COLUMNS): GridItem {
  const width = Math.min(Math.max(item.w, MIN_BLOCK_WIDTH), columnCount);
  const height = Math.max(item.h, MIN_BLOCK_HEIGHT);
  return {
    ...item,
    w: width,
    h: height,
    x: Math.min(Math.max(item.x, 0), columnCount - width),
    y: Math.max(item.y, 0),
  };
}

// Compaction
/*
 Pulls every block as high as it can go, without overlapping.
 */
export function compactVertically(items: GridItem[]): GridItem[] {
  const sortedItems = [...items].sort((first, second) =>
    first.y === second.y ? first.x - second.x : first.y - second.y
  );
  const placedItems: GridItem[] = [];
  for (const item of sortedItems) {
    const movingItem = { ...item };
    // Rise one row at a time while the cell above stays free.
    while (movingItem.y > 0) {
      const oneRowHigher = { ...movingItem, y: movingItem.y - 1 };
      if (findOverlappingItems(placedItems, oneRowHigher).length > 0) {
        break;
      }
      movingItem.y -= 1;
    }
    placedItems.push(movingItem);
  }

  return placedItems;
}

/*
 Pushes every block overlapping `movedItem` downwards, then their own
 neighbours, and so on..
 */
function pushOverlappingItemsDown(items: GridItem[], movedItem: GridItem): GridItem[] {
  let resolvedItems = [...items];
  for (const collidingItem of findOverlappingItems(resolvedItems, movedItem)) {
    const pushedItem = { ...collidingItem, y: movedItem.y + movedItem.h };
    resolvedItems = resolvedItems.map((item) =>
      item.i === pushedItem.i ? pushedItem : item
    );
    // The pushed block may now sit on another one.
    resolvedItems = pushOverlappingItemsDown(resolvedItems, pushedItem);
  }
  return resolvedItems;
}

/*
 Applies a new position to a block and repairs the grid around it.
 */
export function placeItem(
  items: GridItem[],
  itemId: string,
  nextPosition: { x: number; y: number; w: number; h: number },
  columnCount = GRID_COLUMNS
): GridItem[] {
  const movedItem = clampToGrid({ i: itemId, ...nextPosition }, columnCount);
  const otherItems = items.filter((item) => item.i !== itemId);
  const resolvedItems = pushOverlappingItemsDown([...otherItems, movedItem], movedItem);
  return compactVertically(resolvedItems);
}

// Changes to save
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

/* Number of rows the grid needs to show every block. */
export function countRows(items: GridItem[]): number {
  return items.reduce((rows, item) => Math.max(rows, item.y + item.h), 0);
}
