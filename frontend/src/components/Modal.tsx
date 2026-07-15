"use client";

import { ReactNode, useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-x" onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>

      <style jsx global>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: var(--overlay);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: overlayIn 0.15s ease;
          backdrop-filter: blur(2px);
        }
        .modal {
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: 12px; box-shadow: var(--shadow-md);
          max-width: 100%; max-height: 90vh; overflow: hidden;
          display: flex; flex-direction: column;
          animation: modalIn 0.18s ease;
        }
        .modal-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid var(--border);
        }
        .modal-title { font-size: 15px; font-weight: 600; color: var(--text); }
        .modal-x {
          width: 30px; height: 30px; border: none; background: transparent;
          color: var(--text3); cursor: pointer; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-x:hover { background: var(--bg3); color: var(--text); }
        .modal-body { padding: 20px; overflow-y: auto; }
        .modal-foot {
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 14px 20px; border-top: 1px solid var(--border);
        }
        .field { margin-bottom: 16px; }
        .field:last-child { margin-bottom: 0; }
        .field-label { display: block; font-size: 12px; font-weight: 500; color: var(--text2); margin-bottom: 6px; }
        .field-input, .field-select {
          width: 100%; padding: 9px 12px; border-radius: 6px;
          border: 1px solid var(--border); background: var(--bg);
          color: var(--text); font-family: inherit; font-size: 13px;
          outline: none; transition: border-color 0.15s;
        }
        .field-input:focus, .field-select:focus { border-color: var(--primary); }
        @media (max-width: 768px) {
          .modal-overlay { padding: 0; align-items: flex-end; }
          .modal { border-radius: 16px 16px 0 0; max-height: 92vh; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
