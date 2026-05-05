import { useState, useRef, useEffect, useCallback } from "react";
import { Image, X } from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  dataUrl: string;
  uploading: boolean;
}

interface Props {
  onSend: (message: string, images?: string[]) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // --- File helpers ---
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || files.length >= 3) return;
      const images: UploadedFile[] = [];
      for (let i = 0; i < Math.min(fileList.length, 3 - files.length); i++) {
        const f = fileList[i];
        if (!f.type.startsWith("image/")) continue;
        images.push({
          id: crypto.randomUUID(),
          name: f.name,
          dataUrl: "",
          uploading: true,
        });
      }
      if (images.length === 0) return;

      setFiles((prev) => [...prev, ...images]);

      for (let i = 0; i < images.length; i++) {
        const file = fileList[i];
        const dataUrl = await readFileAsDataUrl(file);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === images[i].id ? { ...f, dataUrl, uploading: false } : f,
          ),
        );
      }
    },
    [files.length],
  );

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // --- Drag & Drop ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragCounter.current = 0;
    addFiles(e.dataTransfer.files);
  };

  // --- Paste ---
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const f = items[i].getAsFile();
        if (f) imageItems.push(f);
      }
    }
    if (imageItems.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageItems.forEach((f) => dt.items.add(f));
      addFiles(dt.files);
    }
  };

  // --- Submit ---
  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && files.length === 0) || disabled) return;

    const imageBases = files.filter((f) => !f.uploading).map((f) => f.dataUrl);
    onSend(
      trimmed || "分析这张食物图片",
      imageBases.length > 0 ? imageBases : undefined,
    );
    setInput("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  };

  const handleFileClick = () => fileInputRef.current?.click();

  return (
    <div
      className={`chat-input-container ${isDragOver ? "drag-over" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && <div className="drop-overlay">拖放图片到此上传</div>}

      {/* Image previews */}
      {files.length > 0 && (
        <div className="chat-images-preview">
          {files.map((f) => (
            <div key={f.id} className="chat-image-thumb">
              {f.uploading ? (
                <div className="chat-image-loading">...</div>
              ) : (
                <>
                  <img src={f.dataUrl} alt={f.name} />
                  <button
                    className="chat-image-remove"
                    onClick={() => removeFile(f.id)}
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <button
          className="attach-button"
          onClick={handleFileClick}
          disabled={disabled || files.length >= 3}
        >
          <Image size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="file-input-hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            files.length > 0
              ? "描述图片内容（可选）..."
              : "想了解什么？比如：我今天吃了什么、帮我记录训练..."
          }
          disabled={disabled}
          rows={1}
          className="chat-input"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || (!input.trim() && files.length === 0)}
          className="send-button"
        >
          发送
        </button>
      </div>
    </div>
  );
}
