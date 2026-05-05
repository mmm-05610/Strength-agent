import { useState, useEffect } from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { OnboardingFlow } from "./OnboardingFlow";
import { useChat } from "../../hooks/useChat";
import { useDashboard } from "../../hooks/useDashboard";
import { useActions } from "../../hooks/useActions";
import {
  Zap,
  Brain,
  Settings2,
  ChevronDown,
  UtensilsCrossed,
  Dumbbell,
  Moon,
  Lightbulb,
} from "lucide-react";

const MODEL_OPTIONS = [
  { value: "", label: "默认" },
  { value: "deepseek-v4-flash", label: "V4 Flash" },
  { value: "deepseek-reasoner", label: "Reasoner" },
];

export function ChatPanel() {
  const {
    messages,
    isLoading,
    error,
    thinkingMode,
    setThinkingMode,
    selectedModel,
    setSelectedModel,
    chat,
    routeTier,
    totalCost,
    historyLoaded,
    markToolCallSubmitted,
  } = useChat();
  const { refresh: refreshDashboard } = useDashboard();
  const { dispatch } = useActions();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  useEffect(() => {
    if (historyLoaded && messages.length === 0) {
      setShowOnboarding(true);
    }
  }, [historyLoaded, messages.length]);

  const handleApproveProposal = () => refreshDashboard();
  const handleOnboardingComplete = () => setShowOnboarding(false);

  const handleFormSubmit = async (
    actionName: string,
    data: Record<string, unknown>,
    toolCallId: string,
  ) => {
    const result = await dispatch(actionName, data);

    if (toolCallId && result.success) {
      markToolCallSubmitted(toolCallId, {
        submitted: true as const,
        submitted_data: data,
      });
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (isLoading) return;
    chat(prompt);
  };

  const currentModelLabel =
    MODEL_OPTIONS.find((o) => o.value === selectedModel)?.label || "默认";

  return (
    <div className="chat-panel">
      {/* ── Top Toolbar ── */}
      <div className="chat-toolbar">
        <div className="chat-toolbar-left">
          <span className="chat-toolbar-brand">AI 教练</span>
          {routeTier && (
            <span className="chat-toolbar-cost">¥{totalCost.toFixed(2)}</span>
          )}
        </div>

        <div className="chat-toolbar-controls">
          {/* Mode segmented control */}
          <div className="toolbar-segmented">
            <button
              className={`tseg-btn ${!thinkingMode ? "active" : ""}`}
              onClick={() => setThinkingMode(false)}
            >
              <Zap size={13} />
              <span>快速</span>
            </button>
            <button
              className={`tseg-btn ${thinkingMode ? "active" : ""}`}
              onClick={() => setThinkingMode(true)}
            >
              <Brain size={13} />
              <span>深度</span>
            </button>
          </div>

          {/* Model selector */}
          <div className="toolbar-model-wrap">
            <button
              className="toolbar-model-btn"
              onClick={() => setShowModelMenu(!showModelMenu)}
            >
              <Settings2 size={12} />
              <span>{currentModelLabel}</span>
              <ChevronDown size={10} />
            </button>
            {showModelMenu && (
              <div className="toolbar-model-dropdown">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`toolbar-model-item ${selectedModel === opt.value ? "active" : ""}`}
                    onClick={() => {
                      setSelectedModel(opt.value);
                      setShowModelMenu(false);
                    }}
                  >
                    {opt.label}
                    {selectedModel === opt.value && (
                      <span className="toolbar-model-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Action Chips ── */}
      <div className="chat-quick-chips">
        <button
          className="quick-chip"
          onClick={() => handleQuickAction("帮我记录一下今天的饮食")}
          disabled={isLoading}
        >
          <UtensilsCrossed size={13} />
          <span>记录饮食</span>
        </button>
        <button
          className="quick-chip"
          onClick={() => handleQuickAction("帮我记录今天的训练内容")}
          disabled={isLoading}
        >
          <Dumbbell size={13} />
          <span>记录训练</span>
        </button>
        <button
          className="quick-chip"
          onClick={() =>
            handleQuickAction(
              "帮我记录今天的恢复状态，包括睡眠、疲劳、酸痛和压力",
            )
          }
          disabled={isLoading}
        >
          <Moon size={13} />
          <span>记录恢复</span>
        </button>
        <button
          className="quick-chip"
          onClick={() => handleQuickAction("给我今天的训练建议和饮食建议")}
          disabled={isLoading}
        >
          <Lightbulb size={13} />
          <span>今日建议</span>
        </button>
      </div>

      {showOnboarding && messages.length === 0 && (
        <OnboardingFlow onComplete={handleOnboardingComplete} onSend={chat} />
      )}

      <MessageList
        messages={messages}
        isLoading={isLoading}
        onApproveProposal={handleApproveProposal}
        onFormSubmit={handleFormSubmit}
      />
      {error && <div className="chat-error">{error}</div>}

      <ChatInput onSend={chat} disabled={isLoading} />
    </div>
  );
}
