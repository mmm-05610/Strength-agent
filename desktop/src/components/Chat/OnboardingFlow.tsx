import { useState, useRef, useEffect } from "react";
import { Send, User, Target, Ruler } from "lucide-react";

interface Props {
  onComplete: () => void;
  onSend: (message: string) => void;
}

const QUESTIONS = [
  {
    id: "name",
    icon: User,
    question: "嗨！我是你的 AI 健身教练 💪 先简单认识一下，你叫什么名字？",
    placeholder: "我叫...",
    key: "name",
  },
  {
    id: "goal",
    icon: Target,
    question: "太棒了！你的健身目标是什么？",
    placeholder: "比如：增肌、减脂、保持健康...",
    key: "goal",
  },
  {
    id: "experience",
    icon: Ruler,
    question: "你有过健身经验吗？大概练了多久？",
    placeholder: "比如：完全新手、练了3个月、练了1年...",
    key: "experience",
  },
];

export function OnboardingFlow({ onComplete, onSend }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const current = QUESTIONS[step];
  if (!current) return null;

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setAnswers((prev) => ({ ...prev, [current.key]: trimmed }));
    setInput("");

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      // Build profile summary and send to AI
      const summary = [
        `我叫${answers.name || trimmed}，`,
        `健身目标是${answers.goal || ""}，`,
        `我的经验是：${answers.experience || ""}。`,
        `请帮我设置初始的健身计划和目标，问我还需要什么信息。`,
      ].join("");
      onSend(summary);
      onComplete();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const Icon = current.icon;

  return (
    <div className="onboarding-flow">
      <div className="onboarding-progress">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`onboarding-dot ${i <= step ? "active" : ""}`}
          />
        ))}
      </div>
      <div className="onboarding-card">
        <div className="onboarding-icon">
          <Icon size={20} />
        </div>
        <p className="onboarding-question">{current.question}</p>
        <div className="onboarding-input-row">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={current.placeholder}
            className="onboarding-input"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="onboarding-send"
          >
            <Send size={16} />
          </button>
        </div>
        <button className="onboarding-skip" onClick={onComplete}>
          跳过，直接开始
        </button>
      </div>
    </div>
  );
}
