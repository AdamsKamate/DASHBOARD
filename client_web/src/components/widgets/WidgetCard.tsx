interface WidgetCardProps {
  title: string;
  children: React.ReactNode;
}

export function WidgetCard({ title, children }: WidgetCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
