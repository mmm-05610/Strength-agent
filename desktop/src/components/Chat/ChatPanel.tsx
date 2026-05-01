import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useChat } from "../../hooks/useChat";
import { useDashboard } from "../../hooks/useDashboard";

export function ChatPanel() {
  const { messages, isLoading, error, chat } = useChat();

  const { refresh: refreshDashboard } = useDashboard();

  const handleApproveProposal = () => {
    refreshDashboard();
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>对话</span>
      </div>
      <MessageList
        messages={messages}
        isLoading={isLoading}
        onApproveProposal={handleApproveProposal}
      />
      {error && <div className="chat-error">{error}</div>}
      <ChatInput onSend={chat} disabled={isLoading} />
    </div>
  );
}
