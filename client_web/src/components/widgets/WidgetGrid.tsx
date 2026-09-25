"use client";

import { useState } from "react";

// Skeleton of the dashboard grid (card C10): add / move / remove blocks,
// no real widget data yet — that arrives once /widget-types and /widgets
// are wired to the real (or mock) API. Reordering uses native HTML5
// drag & drop, so no extra dependency is needed (avoids repeating the
// react-simple-maps peer-dependency conflict from earlier).

interface Block {
  id: string;
  label: string;
}

function makeBlock(index: number): Block {
  return { id: crypto.randomUUID(), label: `Widget ${index}` };
}

export function WidgetGrid() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function addBlock() {
    setBlocks((prev) => [...prev, makeBlock(prev.length + 1)]);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleDragStart(id: string) {
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === overId) return;

    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === draggedId);
      const to = prev.findIndex((b) => b.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    setDraggedId(null);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-600">
          {blocks.length} widget{blocks.length !== 1 ? "s" : ""}
        </h2>
        <button
          type="button"
          onClick={addBlock}
          className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
        >
          + Ajouter un widget
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 p-12 text-center text-slate-400 text-sm">
          Aucun widget pour l&apos;instant. Ajoute-en un pour commencer.
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {blocks.map((block) => (
            <div
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(block.id)}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDragEnd={handleDragEnd}
              className={`relative w-48 h-48 rounded border bg-white p-3 cursor-move select-none
                ${draggedId === block.id ? "opacity-40 border-slate-400" : "border-slate-200"}`}
            >
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                aria-label={`Supprimer ${block.label}`}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 text-sm"
              >
                ×
              </button>
              <p className="text-sm font-medium text-slate-700">{block.label}</p>
              <p className="mt-1 text-xs text-slate-400">Pas encore configuré</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
