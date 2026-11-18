/** A button that copies text to the clipboard and says whether it worked. */
import { useEffect, useState } from "react";
import { Icon } from "./Icon.tsx";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const t = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(t);
  }, [status]);
  const copy = () => {
    // the clipboard needs a secure page; when it is missing the button says so instead of failing silently
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject();
    write.then(() => setStatus("copied"), () => setStatus("failed"));
  };
  return (
    <>
      <button type="button" className="btn-quiet btn-icon" onClick={copy}>
        <Icon name={status === "copied" ? "check" : "copy"} size={16} />
        {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : label}
      </button>
      <span className="sr-only" role="status">{status === "copied" ? "Copied" : ""}</span>
    </>
  );
}
