"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WidgetInstance, WidgetType } from "@/lib/types";
import {
  GRID_COLUMNS,
  GridItem,
  MIN_BLOCK_HEIGHT,
  MIN_BLOCK_WIDTH,
  compactVertically,
  countRows,
  placeItem,
  toGridItem,
} from "@/lib/dashboard/layout";
import { WidgetBlock } from "./WidgetBlock";

// The widget grid, written by hand

/* Below this width the grid becomes a real only stack */
const EDITABLE_MIN_WIDTH_PX = 1024;

const ROW_HEIGHT_PX = 90;
const GAP_PX = 16;

/* What is currently being dragged or resized */
interface Gesture {
  kind: "move" | "resize";
  itemId: string;
  /* Pointer position when the gesture started */
  startClientX: number;
  startClientY: number;
  /* Grid position of the block when the gesture started */
  startItem: GridItem;
}

interface WidgetGridProps {
  widgets: WidgetInstance[];
  widgetTypes: WidgetType[];
  onLayoutCommitted: (layout: GridItem[]) => void;
  onRemove: (widgetId: string) => void;
}

export function WidgetGrid({
  widgets,
  widgetTypes,
  onLayoutCommitted,
  onRemove,
}: WidgetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  /*
   The layout being manipulated
   */
  const [draftLayout, setDraftLayout] = useState<GridItem[] | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const savedLayout = useMemo(() => widgets.map(toGridItem), [widgets]);
  const layout = draftLayout ?? savedLayout;
  const widgetTypeById = useMemo(
    () => new Map(widgetTypes.map((widgetType) => [widgetType.id, widgetType])),
    [widgetTypes]
  );

  /*
   The container width decides how wide a column is
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) 
      return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /*
   Editing is limited to wide screens.
   */
  const isEditable = containerWidth >= EDITABLE_MIN_WIDTH_PX;
  const columnWidth =
    containerWidth > 0
      ? (containerWidth - GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS
      : 0;

  /* Grid cell -> pixels */
  const toPixels = useCallback(
    (item: GridItem) => ({
      left: item.x * (columnWidth + GAP_PX),
      top: item.y * (ROW_HEIGHT_PX + GAP_PX),
      width: item.w * columnWidth + (item.w - 1) * GAP_PX,
      height: item.h * ROW_HEIGHT_PX + (item.h - 1) * GAP_PX,
    }),
    [columnWidth]
  );

  /* Pixel distance -> number of cells, rounded to the nearest cell */
  const toCells = useCallback(
    (deltaX: number, deltaY: number) => ({
      columns: Math.round(deltaX / (columnWidth + GAP_PX)),
      rows: Math.round(deltaY / (ROW_HEIGHT_PX + GAP_PX)),
    }),
    [columnWidth]
  );


  // Gestures
  function startGesture(
    kind: Gesture["kind"],
    itemId: string,
    event: React.PointerEvent
  ) {
    if (!isEditable) {
      return;
    }
    const startItem = layout.find((item) => item.i === itemId);
    if (!startItem) {
      return;
    }
    // Capturing the pointer keeps the events coming to this element even when
    // the cursor leaves it otherwise a fast drag would silently stop
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    // Stops the browser from selecting text or scrolling the page instead
    event.preventDefault();
    setGesture({
      kind,
      itemId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startItem,
    });
    setDraftLayout(layout);
  }

  function continueGesture(event: React.PointerEvent) {
    if (!gesture){
      return;
    }
    const { columns, rows } = toCells(
      event.clientX - gesture.startClientX,
      event.clientY - gesture.startClientY
    );
    const { startItem } = gesture;
    const nextPosition =
      gesture.kind === "move"
        ? {
            x: startItem.x + columns,
            y: startItem.y + rows,
            w: startItem.w,
            h: startItem.h,
          }
        : {
            x: startItem.x,
            y: startItem.y,
            w: Math.max(startItem.w + columns, MIN_BLOCK_WIDTH),
            h: Math.max(startItem.h + rows, MIN_BLOCK_HEIGHT),
          };
    setDraftLayout(placeItem(layout, gesture.itemId, nextPosition));
  }

  /*
   Saved when the gesture ends, never during it: a save on every pointer move
   would send dozens of requests per drag
   */
  function endGesture() {
    if (!gesture) return;
    const finalLayout = draftLayout;
    setGesture(null);
    setDraftLayout(null);
    if (finalLayout) {
      onLayoutCommitted(finalLayout);
    }
  }

  // Keyboard
  function handleKeyDown(event: React.KeyboardEvent, itemId: string) {
    if (!isEditable) {
      return;
    }
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction) {
      return;
    }
    const item = layout.find((candidate) => candidate.i === itemId);
    if (!item) {
      return;
    }
    event.preventDefault();
    const nextPosition = event.shiftKey
      ? {
          x: item.x,
          y: item.y,
          w: Math.max(item.w + direction.x, MIN_BLOCK_WIDTH),
          h: Math.max(item.h + direction.y, MIN_BLOCK_HEIGHT),
        }
      : { x: item.x + direction.x, y: item.y + direction.y, w: item.w, h: item.h };
    const nextLayout = placeItem(layout, itemId, nextPosition);
    onLayoutCommitted(nextLayout);
  }

  // Rendering

  // On a narrow screen the blocks are simply stacked, in reading order
  if (containerWidth > 0 && !isEditable) {
    return (
      <div ref={containerRef} className="flex flex-col gap-4">
        {/*
          On a narrow screen the grid is a single column and read-only: the
          stored positions describe a twelve column layout, and saving one
          computed here would scramble the desktop arrangement
          Said out loud rather than left to be guessed: a user who cannot drag
          a widget on their phone should know it is deliberate
        */}
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
          Les widgets sont empilés et non modifiables sur petit écran. Passe sur
          un écran plus large pour les déplacer ou les redimensionner.
        </p>

        {compactVertically(layout).map((item) => {
          const widget = widgets.find((candidate) => candidate.id === item.i);
          if (!widget) {
            return null;
          }
          return (
            <div key={item.i} style={{ height: item.h * ROW_HEIGHT_PX }}>
              <WidgetBlock
                widget={widget}
                widgetType={widgetTypeById.get(widget.widgetTypeId)}
                onRemove={onRemove}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const gridHeight = countRows(layout) * (ROW_HEIGHT_PX + GAP_PX);
  const draggedItem = gesture ? layout.find((item) => item.i === gesture.itemId) : null;
  
  return (
    <div
      ref={containerRef}
      // Named region: a screen reader user hears "grille des widgets" instead
      // of landing in an unlabelled block of twelve articles
      role="region"
      aria-label="Grille des widgets"
      className="relative w-full"
      style={{ height: gridHeight || undefined }}
      onPointerMove={continueGesture}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {/* Shows where the dragged block will land */}
      {draggedItem && (
        <div
          aria-hidden="true"
          className="absolute rounded-md bg-signal/15 border border-signal/40 pointer-events-none"
          style={toPixels(draggedItem)}
        />
      )}

      {layout.map((item) => {
        const widget = widgets.find((candidate) => candidate.id === item.i);
        if (!widget) {
          return null;
        }
        const isBeingDragged = gesture?.itemId === item.i;

        return (
          <div
            key={item.i}
            className={
              isBeingDragged
                ? "absolute z-10 opacity-80"
                : "absolute transition-all duration-150"
            }
            style={toPixels(item)}
          >
            <WidgetBlock
              widget={widget}
              widgetType={widgetTypeById.get(widget.widgetTypeId)}
              onRemove={onRemove}
              onDragHandlePointerDown={(event) => startGesture("move", item.i, event)}
              onDragHandleKeyDown={(event) => handleKeyDown(event, item.i)}
              isEditable={isEditable}
            />

            {isEditable && (
              <div
                role="presentation"
                onPointerDown={(event) => startGesture("resize", item.i, event)}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize
                           border-b-2 border-r-2 border-line-strong rounded-br-md"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
