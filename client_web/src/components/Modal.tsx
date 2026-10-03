"use client";

import { useEffect, useRef } from "react";

// A modal dialog.


interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /* Rendered at the bottom, separated from the content. */
  footer?: React.ReactNode;
}

/**Elements that can hold focus, in DOM order. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  /* Where the focus was before opening, to put it back on close. */
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement;

    // The first field, rather than the dialog itself: the user can start
    // typing straight away.
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    // Scrolling the page behind a modal is disorienting: the content moves
    // under a dialog that stays put.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    // Keeps Tab inside the dialog: without this, the focus walks into the
    // page behind, where the user cannot see where they are.
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    );
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80"
      // Clicking outside closes, which is what users expect of an overlay.
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        // Stops a click inside from reaching the backdrop handler above.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden
                   rounded-md border border-line bg-surface shadow-xl"
      >
        <header className="flex items-center justify-between gap-4 bg-raised px-4 py-3 border-b border-line">
          <h2 id="modal-title" className="text-base font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-slate-400 hover:text-white hover:bg-ink"
            aria-label="Fermer"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
