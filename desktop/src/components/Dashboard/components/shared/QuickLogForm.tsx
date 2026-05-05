import type { ReactNode, FormEvent } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function QuickLogForm({
  icon,
  title,
  children,
  onSubmit,
  submitting,
  submitLabel = "保存",
}: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className="quick-log-form" onSubmit={handleSubmit}>
      <div className="quick-log-form-title">
        {icon}
        {title}
      </div>
      <div className="quick-log-form-fields">{children}</div>
      <button
        type="submit"
        className="quick-log-form-submit"
        disabled={submitting}
      >
        {submitting ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
