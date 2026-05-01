import { useState } from "react";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

export interface HistoryItem {
  id: number;
  date: string;
  summary: string;
  details: string;
}

interface Props {
  title: string;
  items: HistoryItem[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  deleting: number | null;
  defaultVisible?: number;
}

export function HistoryList({
  title,
  items,
  onEdit,
  onDelete,
  deleting,
  defaultVisible = 5,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, defaultVisible);
  const hasMore = items.length > defaultVisible;

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="overview-section-title">{title}</div>
      <div className="history-list">
        {visible.map((item) => (
          <div key={item.id} className="history-item">
            <div className="history-item-main">
              <span className="history-item-date">{item.date}</span>
              <span className="history-item-summary">{item.summary}</span>
              <span className="history-item-details">{item.details}</span>
            </div>
            <div className="history-item-actions">
              <button
                className="history-action-btn"
                onClick={() => onEdit(item.id)}
                title="编辑"
              >
                <Pencil size={14} />
              </button>
              <button
                className="history-action-btn danger"
                onClick={() => onDelete(item.id)}
                disabled={deleting === item.id}
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          className="history-expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> 收起
            </>
          ) : (
            <>
              <ChevronDown size={14} /> 展开全部 ({items.length} 条)
            </>
          )}
        </button>
      )}
    </div>
  );
}
