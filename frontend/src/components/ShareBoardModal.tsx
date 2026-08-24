"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BoardShareStatus } from "@/lib/types";
import { useToast } from "@/context/ToastContext";
import { Modal } from "./Modal";

export function ShareBoardModal({
  open,
  onClose,
  boardId,
}: {
  open: boolean;
  onClose: () => void;
  boardId: number;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<BoardShareStatus | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink("");
    api.getBoardShare(boardId)
      .then(setStatus)
      .catch((error: Error) => toast(error.message, "error"));
  }, [open, boardId, toast]);

  async function createLink() {
    setBusy(true);
    try {
      const created = await api.createBoardShare(boardId);
      const url = `${window.location.origin}${created.public_path}`;
      setLink(url);
      setStatus({ active: true, token_prefix: created.token.slice(0, 12), created_at: created.created_at });
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast("Публичная ссылка создана и скопирована");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast("Ссылка скопирована");
  }

  async function revoke() {
    if (!confirm("Отключить публичный доступ к этой доске?")) return;
    setBusy(true);
    try {
      await api.revokeBoardShare(boardId);
      setLink("");
      setStatus({ active: false, token_prefix: null, created_at: null });
      toast("Публичный доступ отключён");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Поделиться доской"
      width={520}
      footer={<button className="btn btn-ghost" onClick={onClose}>Закрыть</button>}
    >
      <div className="share-note">
        <span className="material-symbols-outlined">visibility</span>
        <div>
          <strong>Только просмотр, без входа</strong>
          <p>Клиент увидит названия, описания, статусы и сроки задач. Сотрудники и внутренние данные не публикуются.</p>
        </div>
      </div>

      {link ? (
        <div className="share-link">
          <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <button className="btn btn-primary" onClick={copyLink}>Копировать</button>
        </div>
      ) : status?.active ? (
        <div className="share-state">
          <span className="status-dot" />
          <div>
            <strong>Публичный доступ включён</strong>
            <p>Из соображений безопасности полный токен показывается один раз. Создайте новую ссылку, чтобы скопировать её; старая сразу перестанет работать.</p>
          </div>
        </div>
      ) : (
        <div className="share-state muted">
          <span className="material-symbols-outlined">link_off</span>
          <div>
            <strong>Публичный доступ выключен</strong>
            <p>Создайте защищённую ссылку, которую невозможно подобрать перебором.</p>
          </div>
        </div>
      )}

      <div className="share-actions">
        <button className="btn btn-primary" onClick={createLink} disabled={busy}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>link</span>
          {status?.active ? "Создать новую ссылку" : "Создать ссылку"}
        </button>
        {status?.active && (
          <button className="btn btn-ghost" onClick={revoke} disabled={busy} style={{ color: "var(--red)" }}>
            Отключить доступ
          </button>
        )}
      </div>

      <style jsx>{`
        .share-note, .share-state { display: flex; gap: 12px; padding: 14px; border-radius: 10px; background: var(--primary-dim); color: var(--primary); }
        .share-note strong, .share-state strong { color: var(--text); font-size: 13px; }
        .share-note p, .share-state p { margin: 4px 0 0; color: var(--text3); font-size: 12px; line-height: 1.45; }
        .share-state { margin-top: 14px; background: var(--green-bg); }
        .share-state.muted { background: var(--bg3); color: var(--text3); }
        .status-dot { width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--green); flex: none; }
        .share-link { display: flex; gap: 8px; margin-top: 14px; }
        .share-link input { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg3); color: var(--text2); font-family: inherit; font-size: 12px; }
        .share-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
        .share-actions .btn { display: inline-flex; align-items: center; gap: 6px; }
      `}</style>
    </Modal>
  );
}
