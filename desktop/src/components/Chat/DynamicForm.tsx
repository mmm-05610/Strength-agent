import { useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface FieldSchema {
  key: string;
  label: string;
  type: "number" | "integer" | "string" | "date" | "select";
  unit?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: string[];
  default_value?: string | number;
}

export interface FormSchema {
  title: string;
  description?: string;
  action: string;
  fields: FieldSchema[];
}

interface Props {
  schema: FormSchema;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

function buildInitialValues(fields: FieldSchema[]): Record<string, string> {
  const init: Record<string, string> = {};
  for (const f of fields) {
    if (f.default_value != null) {
      init[f.key] = String(f.default_value);
    } else if (
      f.placeholder &&
      f.type !== "string" &&
      f.type !== "date" &&
      f.type !== "select"
    ) {
      const num = parseFloat(f.placeholder);
      if (!isNaN(num)) {
        init[f.key] = String(num);
      }
    }
  }
  return init;
}

export function DynamicForm({ schema, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildInitialValues(schema.fields),
  );
  const [status, setStatus] = useState<
    "idle" | "submitting" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [validationError, setValidationError] = useState("");

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setValidationError("");
  };

  const handleSubmit = async () => {
    const data: Record<string, unknown> = {};
    for (const field of schema.fields) {
      const raw = values[field.key];
      if (raw === undefined || raw === "") {
        if (field.required) {
          setValidationError(`请填写 ${field.label}`);
          return;
        }
        continue;
      }
      if (field.type === "number") data[field.key] = parseFloat(raw);
      else if (field.type === "integer") data[field.key] = parseInt(raw, 10);
      else data[field.key] = raw;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      await onSubmit(data);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "保存失败");
    }
  };

  if (status === "saved") {
    return (
      <div className="dynamic-form submitted">
        <div className="df-submitted-icon">
          <Check size={18} />
        </div>
        <span>已保存</span>
      </div>
    );
  }

  const isSubmitting = status === "submitting";

  return (
    <div className={`dynamic-form${isSubmitting ? " submitting" : ""}`}>
      {isSubmitting && (
        <div className="df-overlay">
          <Loader2 size={20} className="spin" />
          <span>正在保存...</span>
        </div>
      )}
      <div className="df-header">
        <h4 className="df-title">{schema.title}</h4>
        {schema.description && <p className="df-desc">{schema.description}</p>}
      </div>
      <div className="df-fields">
        {schema.fields.map((field) => (
          <div key={field.key} className="df-field">
            <label className="df-label">
              {field.label}
              {field.required && <span className="df-required">*</span>}
              {field.unit && <span className="df-unit">{field.unit}</span>}
            </label>
            {field.type === "select" && field.options ? (
              <select
                className="df-input"
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">选择...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === "date" ? (
              <input
                type="date"
                className="df-input"
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                disabled={isSubmitting}
              />
            ) : (
              <input
                type={field.type === "integer" ? "number" : field.type}
                className="df-input"
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                step={field.type === "integer" ? "1" : "any"}
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                disabled={isSubmitting}
              />
            )}
          </div>
        ))}
      </div>
      {validationError && (
        <div className="df-error">
          <AlertCircle size={13} />
          <span>{validationError}</span>
        </div>
      )}
      {status === "error" && (
        <div className="df-error">
          <AlertCircle size={13} />
          <span>{errorMsg}</span>
          <button className="df-retry" onClick={handleSubmit}>
            重试
          </button>
        </div>
      )}
      <button
        className="df-submit"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 size={14} className="spin" />
            <span>保存中...</span>
          </>
        ) : (
          "提交"
        )}
      </button>
    </div>
  );
}
