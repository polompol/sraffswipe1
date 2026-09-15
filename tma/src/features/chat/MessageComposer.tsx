import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { IconSend } from "@/components/Icons";

interface Props {
  text: string;
  setText: (value: string) => void;
  onSubmit: (text: string) => void | Promise<unknown>;
  disabled: boolean;
}

/** Composer-level guard: one tap/Enter action can enqueue only one message. */
export function MessageComposer({ text, setText, onSubmit, disabled }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const empty = !text.trim();

  async function submit() {
    if (disabled || empty || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    try {
      await onSubmit(text);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="row">
      <input
        className="input"
        aria-label="Текст сообщения"
        placeholder={disabled ? "Чат недоступен" : "Сообщение…"}
        value={text}
        maxLength={2000}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          void submit();
        }}
      />
      <Button
        block={false}
        aria-label="Отправить"
        disabled={disabled || empty || submitting}
        onClick={submit}
        style={{ width: 52, flex: "none", padding: 0 }}
      >
        <IconSend size={20} />
      </Button>
    </div>
  );
}
