import { useState } from "react";
import { Check, X } from "lucide-react";
import type { GoalConfig } from "../../../../api/client";

interface Props {
  goal: GoalConfig;
  onSave: (goal: GoalConfig) => void;
  onCancel: () => void;
  saving: boolean;
}

export function GoalEditor({ goal, onSave, onCancel, saving }: Props) {
  const [form, setForm] = useState<GoalConfig>({ ...goal });

  const handleChange = (
    field: keyof GoalConfig,
    value: string | number | null,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="detail-section">
      <div className="card editor-card">
        <div className="editor-header">
          <span className="detail-section-title" style={{ margin: 0 }}>
            编辑目标
          </span>
          <button className="editor-close-btn" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="form-grid-2">
          <div className="form-field">
            <label className="form-label">目标类型</label>
            <select
              className="form-input"
              value={form.goal_type}
              onChange={(e) =>
                handleChange(
                  "goal_type",
                  e.target.value as GoalConfig["goal_type"],
                )
              }
            >
              <option value="muscle_gain">增肌</option>
              <option value="fat_loss">减脂</option>
              <option value="maintenance">维持</option>
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">起始日期</label>
            <input
              className="form-input"
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange("start_date", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">目标日期</label>
            <input
              className="form-input"
              type="date"
              value={form.target_date}
              onChange={(e) => handleChange("target_date", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">起始体重 (kg)</label>
            <input
              className="form-input"
              type="number"
              step={0.1}
              value={form.start_weight_kg}
              onChange={(e) =>
                handleChange("start_weight_kg", parseFloat(e.target.value) || 0)
              }
            />
          </div>

          <div className="form-field">
            <label className="form-label">目标体重 (kg)</label>
            <input
              className="form-input"
              type="number"
              step={0.1}
              value={form.target_weight_kg}
              onChange={(e) =>
                handleChange(
                  "target_weight_kg",
                  parseFloat(e.target.value) || 0,
                )
              }
            />
          </div>

          <div className="form-field">
            <label className="form-label">起始肌肉量 (kg, 可选)</label>
            <input
              className="form-input"
              type="number"
              step={0.1}
              value={form.start_muscle_kg ?? ""}
              onChange={(e) =>
                handleChange(
                  "start_muscle_kg",
                  e.target.value === "" ? null : parseFloat(e.target.value),
                )
              }
            />
          </div>

          <div className="form-field">
            <label className="form-label">目标肌肉量 (kg, 可选)</label>
            <input
              className="form-input"
              type="number"
              step={0.1}
              value={form.target_muscle_kg ?? ""}
              onChange={(e) =>
                handleChange(
                  "target_muscle_kg",
                  e.target.value === "" ? null : parseFloat(e.target.value),
                )
              }
            />
          </div>
        </div>

        <div className="editor-actions">
          <button
            className="btn-approve btn-full"
            onClick={() => onSave(form)}
            disabled={saving}
          >
            <Check size={14} style={{ marginRight: 4 }} />
            {saving ? "保存中..." : "保存目标"}
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
