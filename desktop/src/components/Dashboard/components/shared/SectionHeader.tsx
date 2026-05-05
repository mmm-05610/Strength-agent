interface Props {
  title: string;
  action?: { label: string; onClick: () => void };
}

export function SectionHeader({ title, action }: Props) {
  return (
    <div className="section-header">
      <h3 className="section-header-title">{title}</h3>
      {action && (
        <button className="section-header-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
