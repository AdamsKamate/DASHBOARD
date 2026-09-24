import { useId } from "react";

// Base components.

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-signal text-white hover:brightness-110",
  secondary: "bg-surface text-white border border-line hover:border-signal",
  danger: "bg-transparent text-flare border border-line hover:border-flare",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...buttonProps
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      // disabled:cursor not allowed matters: without it a disabled button
      // still shows the pointer cursor and looks clickable.
      className={`h-10 px-4 rounded-md font-medium transition
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${BUTTON_STYLES[variant]} ${className}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  id,
  ...inputProps
}: {
  label: string;
  /** Field level message, shown under the input and read by screen readers. */
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  // useId generates a unique identifier per instance, so two inputs with the
  // same label never share one. Clicking the label focuses the right field,
  // and screen readers announce the pair correctly.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm text-slate-400">
        {label}
      </label>
      <input
        id={inputId}
        // aria-invalid and aria-describedby link the field to its message:
        // a screen reader then reads the error when focus enters the field.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-10 px-3 rounded-md bg-surface border text-white outline-none
                    focus:border-signal ${error ? "border-flare" : "border-line"}`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-flare text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-line bg-surface p-4 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>}
      {children}
    </div>
  );
}

/*
 Form level error: what went wrong, plus the list of validation problems
 returned by the API in `details`.
 */
export function FormError({ message, details }: { message: string; details?: string[] }) {
  return (
    <div role="alert" className="text-flare text-sm">
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc list-inside text-xs">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Success message, same reading behaviour as FormError. */
export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-pulse text-sm">
      {children}
    </p>
  );
}
