import React, { useEffect, useId, useRef } from "react";
import "./FormDialog.css";

export default function FormDialog({ title, description, submitLabel = "Save", disabled = false, onSubmit, onClose, children }: {
  title: string;
  description?: string;
  submitLabel?: string;
  disabled?: boolean;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId(), descriptionId = useId(), panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    return () => previous?.focus();
  }, []);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !panel.current) return;
    const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="form-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="form-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onKeyDown={onKeyDown}>
      <div className="form-dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="form-dialog-close" aria-label="Close dialog" onClick={onClose}>×</button></div>
      <form onSubmit={event => { event.preventDefault(); void onSubmit(); }}>
        <div className="form-dialog-fields">{children}</div>
        <div className="form-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={disabled}>{submitLabel}</button></div>
      </form>
    </div>
  </div>;
}
