import {
  Check,
  X,
  Loader2,
  Database,
  TrendingUp,
  Apple,
  Dumbbell,
  Moon,
  Target,
} from "lucide-react";
import { DynamicForm } from "./DynamicForm";
import type { FormSchema } from "./DynamicForm";

const TOOL_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  log_nutrition: Apple,
  log_workout: Dumbbell,
  log_readiness: Moon,
  update_body_metric: Database,
  update_goal: Target,
  get_dashboard_data: TrendingUp,
  render_form: Database,
  render_chart: TrendingUp,
};

interface SubmittedFormSummaryProps {
  title: string;
  changes?: Array<{
    key: string;
    label: string;
    before: string;
    after: string;
  }>;
  submittedData: Record<string, unknown>;
}

function SubmittedFormSummary({
  title,
  changes,
  submittedData,
}: SubmittedFormSummaryProps) {
  const displayChanges =
    changes && changes.length > 0
      ? changes
      : Object.entries(submittedData)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => ({
            key: k,
            label: k,
            before: "—",
            after: String(v),
          }));

  return (
    <div className="form-submitted-summary">
      <div className="fss-header">
        <Check size={14} />
        <span>{title} — 已保存</span>
      </div>
      {displayChanges.length > 0 && (
        <div className="fss-changes">
          {displayChanges.map((c) => (
            <span
              key={c.key}
              className={`fss-change-chip ${c.before !== "—" ? "changed" : "new"}`}
            >
              <span className="fss-change-label">{c.label}</span>
              {c.before !== "—" && (
                <span className="fss-change-old">{c.before}</span>
              )}
              {c.before !== "—" && <span className="fss-change-arrow">→</span>}
              <span className="fss-change-new">{c.after}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  log_nutrition: "记录饮食",
  log_workout: "记录训练",
  log_readiness: "记录恢复",
  update_body_metric: "更新身体数据",
  update_goal: "更新目标",
  get_dashboard_data: "查询数据",
  render_form: "生成表单",
  render_chart: "生成图表",
};

export interface ToolCall {
  id: string;
  tool_name: string;
  arguments: string;
  result?: ToolResult;
}

export interface ToolResult {
  success?: boolean;
  message?: string;
  error?: string;
  rendered?: string;
  form_schema?: Record<string, unknown>;
  chart_config?: Record<string, unknown>;
  submitted?: boolean;
  changes?: Array<{
    key: string;
    label: string;
    before: string;
    after: string;
  }>;
  submitted_data?: Record<string, unknown>;
}

interface Props {
  call: ToolCall;
  onFormSubmit?: (
    actionName: string,
    data: Record<string, unknown>,
    toolCallId: string,
  ) => Promise<void>;
}

export function ToolCallCard({ call, onFormSubmit }: Props) {
  const Icon = TOOL_ICONS[call.tool_name] || Database;
  const label = TOOL_LABELS[call.tool_name] || call.tool_name;
  const result = call.result;
  const isPending = !result;
  const isSuccess = result?.success !== false;
  const isError = result?.success === false;

  let argsPreview = "";
  try {
    const parsed = JSON.parse(call.arguments);
    const entries = Object.entries(parsed as Record<string, unknown>).slice(
      0,
      3,
    );
    argsPreview = entries
      .map(
        ([k, v]) =>
          `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30)}`,
      )
      .join(", ");
  } catch {
    argsPreview = call.arguments?.slice(0, 60) || "";
  }

  const formSchema = result?.form_schema as FormSchema | undefined;
  const isSubmitted = result?.submitted === true;
  const changes = result?.changes as
    | Array<{ key: string; label: string; before: string; after: string }>
    | undefined;
  const submittedData = result?.submitted_data as
    | Record<string, unknown>
    | undefined;

  return (
    <div
      className={`tool-call-card ${isPending ? "pending" : isSuccess ? "success" : "error"}`}
    >
      <div className="tcc-header">
        <Icon size={15} />
        <span className="tcc-label">{label}</span>
        <span className="tcc-status-icon">
          {isPending && <Loader2 size={14} className="spin" />}
          {isSuccess && result && !isPending && <Check size={14} />}
          {isError && <X size={14} />}
        </span>
      </div>
      <div className="tcc-args">{argsPreview || "—"}</div>
      {result?.message && <div className="tcc-result">{result.message}</div>}
      {result?.error && <div className="tcc-error">{result.error}</div>}

      {formSchema &&
        onFormSubmit &&
        (isSubmitted && submittedData ? (
          <SubmittedFormSummary
            title={formSchema.title}
            changes={changes}
            submittedData={submittedData}
          />
        ) : (
          <div className="tcc-form-wrap">
            <DynamicForm
              schema={formSchema}
              onSubmit={(data) =>
                onFormSubmit(formSchema.action, data, call.id)
              }
            />
          </div>
        ))}
    </div>
  );
}

/** Render a list of tool call cards inline in chat */
export function AIChat({ children }: { children: React.ReactNode }) {
  return <div className="ai-tool-calls">{children}</div>;
}
