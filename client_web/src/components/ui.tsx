// components/ui.tsx
// Les 3 composants de base : Button, Input, Card.
// Du React tout simple (props + JSX), stylé avec Tailwind.

export function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "primary"
      ? "bg-signal text-white hover:opacity-90"
      : "bg-surface text-white border border-line";

  return (
    <button
      className={`h-10 px-4 rounded-md font-medium ${styles}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-400">{label}</label>
      <input
        className="h-10 px-3 rounded-md bg-surface border border-line text-white outline-none focus:border-signal"
        {...props}
      />
    </div>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      {title && <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>}
      {children}
    </div>
  );
}
