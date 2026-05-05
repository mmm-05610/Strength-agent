import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DynamicForm } from "./DynamicForm";
import { ChartRenderer } from "./ChartRenderer";
import { Check, X } from "lucide-react";

interface BatchSummaryData {
  title: string;
  changes: Array<{
    category: string;
    field_label: string;
    before: string;
    after: string;
    success: boolean;
  }>;
}

interface Props {
  content: string;
  onFormSubmit?: (
    category: string,
    data: Record<string, unknown>,
    toolCallId: string,
  ) => Promise<void>;
}

function parseCustomBlocks(text: string) {
  const parts: Array<{
    type: "markdown" | "chart" | "form" | "batch_summary";
    content: string;
  }> = [];
  const regex = /:::(chart|form|batch_summary)\s*(\{[\s\S]*?\})\s*:::/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({
        type: "markdown",
        content: text.slice(lastIdx, match.index),
      });
    }
    parts.push({
      type: match[1] as "chart" | "form" | "batch_summary",
      content: match[2],
    });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "markdown", content: text.slice(lastIdx) });
  }

  return parts.length > 0 ? parts : [{ type: "markdown", content: text }];
}

function BatchSummaryCard({ data }: { data: BatchSummaryData }) {
  const validChanges = data.changes.filter((c) => c.field_label && c.after);
  if (validChanges.length === 0) return null;

  return (
    <div className="batch-summary-card">
      <div className="batch-summary-header">
        <Check size={14} />
        <span>{data.title || "本次更新摘要"}</span>
        <span className="batch-summary-count">
          {validChanges.length} 项变更
        </span>
      </div>
      <div className="batch-summary-changes">
        {validChanges.map((c, i) => (
          <div
            key={i}
            className={`batch-summary-item ${c.success ? "" : "failed"}`}
          >
            <span className="batch-summary-label">{c.field_label}</span>
            {c.before !== "—" && (
              <span className="batch-summary-old">{c.before}</span>
            )}
            {c.before !== "—" && <span className="batch-summary-arrow">→</span>}
            <span className="batch-summary-new">{c.after}</span>
            {c.success ? (
              <Check size={12} className="batch-summary-icon success" />
            ) : (
              <X size={12} className="batch-summary-icon error" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RichMarkdown({ content, onFormSubmit }: Props) {
  const blocks = parseCustomBlocks(content);

  return (
    <div className="rich-markdown">
      {blocks.map((block, i) => {
        if (block.type === "chart") {
          try {
            const config = JSON.parse(block.content);
            return <ChartRenderer key={i} config={config} />;
          } catch {
            return (
              <div key={i} className="rmd-error">
                图表配置解析失败
              </div>
            );
          }
        }
        if (block.type === "form") {
          try {
            const schema = JSON.parse(block.content);
            return (
              <DynamicForm
                key={i}
                schema={schema}
                onSubmit={(data) =>
                  onFormSubmit?.(schema.category, data, "") ?? Promise.resolve()
                }
              />
            );
          } catch {
            return (
              <div key={i} className="rmd-error">
                表单配置解析失败
              </div>
            );
          }
        }
        if (block.type === "batch_summary") {
          try {
            const data = JSON.parse(block.content) as BatchSummaryData;
            return <BatchSummaryCard key={i} data={data} />;
          } catch {
            return (
              <div key={i} className="rmd-error">
                摘要解析失败
              </div>
            );
          }
        }
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="rmd-table-wrap">
                  <table>{children}</table>
                </div>
              ),
              th: ({ children }) => <th>{children}</th>,
              td: ({ children }) => <td>{children}</td>,
              blockquote: ({ children }) => (
                <blockquote className="rmd-blockquote">{children}</blockquote>
              ),
              code: ({ className, children }) => {
                const inline = !className;
                if (inline)
                  return <code className="rmd-inline-code">{children}</code>;
                return (
                  <pre className="rmd-code-block">
                    <code className={className}>{children}</code>
                  </pre>
                );
              },
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              ul: ({ children }) => <ul className="rmd-list">{children}</ul>,
              ol: ({ children }) => (
                <ol className="rmd-list-ordered">{children}</ol>
              ),
              hr: () => <hr className="rmd-divider" />,
              h2: ({ children }) => <h2 className="rmd-h2">{children}</h2>,
              h3: ({ children }) => <h3 className="rmd-h3">{children}</h3>,
              p: ({ children }) => <p className="rmd-p">{children}</p>,
              strong: ({ children }) => (
                <strong className="rmd-strong">{children}</strong>
              ),
            }}
          >
            {block.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
