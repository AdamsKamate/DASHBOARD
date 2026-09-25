"use client";

import { useMemo, useState } from "react";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { WidgetInstance, WidgetType } from "@/lib/types";
import { GRID_COLUMNS, GridItem, toGridItem } from "@/lib/dashboard/layout";
import { WidgetBlock } from "./WidgetBlock";

// The widget grid.
const ResponsiveGrid = WidthProvider(Responsive);

/*
 Three screen widths. Stored positions belong to the desktop grid ("large",
 12 columns).
 */
const BREAKPOINTS = { large: 1024, medium: 640, small: 0 };
const COLUMNS = { large: GRID_COLUMNS, medium: 6, small: 1 };

const REFERENCE_BREAKPOINT = "large";

const ROW_HEIGHT_PX = 90;
const GAP_PX: [number, number] = [16, 16];

interface WidgetGridProps {
  widgets: WidgetInstance[];
  widgetTypes: WidgetType[];
  onLayoutCommitted: (layout: GridItem[]) => void;
  onRemove: (widgetId: string) => void;
}

export function WidgetGrid({ widgets, widgetTypes, onLayoutCommitted, onRemove }: WidgetGridProps) {
  const [currentBreakpoint, setCurrentBreakpoint] = useState(REFERENCE_BREAKPOINT);

  const layouts = useMemo(
    () => ({ [REFERENCE_BREAKPOINT]: widgets.map(toGridItem) }),
    [widgets]
  );

  const widgetTypeById = useMemo(
    () => new Map(widgetTypes.map((widgetType) => [widgetType.id, widgetType])),
    [widgetTypes]
  );

  const isEditable = currentBreakpoint === REFERENCE_BREAKPOINT;

  function commitLayout(layout: Layout[]) {
    if (!isEditable) return;
    onLayoutCommitted(layout);
  }

  return (
    <ResponsiveGrid
      className="widget-grid"
      layouts={layouts}
      breakpoints={BREAKPOINTS}
      cols={COLUMNS}
      rowHeight={ROW_HEIGHT_PX}
      margin={GAP_PX}
      isDraggable={isEditable}
      isResizable={isEditable}
      draggableHandle=".widget-drag-handle"
      draggableCancel=".widget-no-drag"
      compactType="vertical"
      onBreakpointChange={setCurrentBreakpoint}
      onDragStop={commitLayout}
      onResizeStop={commitLayout}
    >
      {widgets.map((widget) => (
        <div key={widget.id}>
          <WidgetBlock
            widget={widget}
            widgetType={widgetTypeById.get(widget.widgetTypeId)}
            onRemove={onRemove}
          />
        </div>
      ))}
    </ResponsiveGrid>
  );
}
