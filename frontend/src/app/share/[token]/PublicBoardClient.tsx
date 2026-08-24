"use client";

import { useEffect, useState } from "react";
import { getPublicBoard } from "@/lib/api";
import { PublicBoard } from "@/lib/types";
import { PublicKanbanBoard } from "@/components/PublicKanbanBoard";
import { GanttBoard } from "@/components/GanttBoard";

export function PublicBoardClient({ token }: { token: string }) {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"kanban" | "gantt">("kanban");

  useEffect(() => {
    getPublicBoard(token).then(setBoard).catch((reason: Error) => setError(reason.message));
  }, [token]);

  if (error) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", textAlign: "center", color: "var(--text3)", padding: 24 }}>
        <span className="material-symbols-outlined">link_off</span>
        <h1 style={{ color: "var(--text)", marginBottom: 4 }}>Ссылка недоступна</h1>
        <p style={{ margin: 0 }}>{error}</p>
      </main>
    );
  }

  if (!board) {
    return <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", color: "var(--text3)" }}>Загрузка доски…</main>;
  }

  return (
    <main className="public-page">
      <header className="public-header">
        <div className="brand">
          <span>N</span>
          <div><strong>NevOcean</strong><small>Публичный план работ</small></div>
        </div>
        <div className="readonly"><span className="material-symbols-outlined">visibility</span> Только просмотр</div>
      </header>

      <section className="public-content">
        <div className="public-title">
          <div>
            <p>Доска проекта</p>
            <h1>{board.name}</h1>
          </div>
          <div className="public-switch" role="group" aria-label="Представление доски">
            <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>
              <span className="material-symbols-outlined">view_kanban</span> Kanban
            </button>
            <button className={view === "gantt" ? "active" : ""} onClick={() => setView("gantt")}>
              <span className="material-symbols-outlined">view_timeline</span> Gantt
            </button>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="kanban-scroll">
            <PublicKanbanBoard columns={board.columns} tasks={board.tasks} />
          </div>
        ) : (
          <GanttBoard columns={board.columns} tasks={board.tasks} />
        )}
      </section>

      <footer className="public-footer">Сроки и статусы обновляются владельцем доски в NevOcean.</footer>

      <style jsx>{`
        .public-page { min-height: 100vh; background: var(--bg); color: var(--text); }
        .public-header { height: 68px; padding: 0 clamp(20px, 5vw, 72px); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); background: var(--bg2); }
        .brand { display: flex; align-items: center; gap: 11px; }
        .brand > span { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--primary); color: white; font-weight: 800; }
        .brand div { display: flex; flex-direction: column; }
        .brand strong { font-size: 14px; }
        .brand small { color: var(--text3); font-size: 10px; }
        .readonly { display: flex; align-items: center; gap: 6px; color: var(--text3); font-size: 12px; }
        .readonly .material-symbols-outlined { font-size: 17px; }
        .public-content { padding: 34px clamp(20px, 5vw, 72px) 56px; }
        .public-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 24px; }
        .public-title p { margin: 0 0 5px; color: var(--text3); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .public-title h1 { margin: 0; font-size: clamp(24px, 3vw, 36px); }
        .public-switch { display: inline-flex; padding: 3px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg3); }
        .public-switch button { display: flex; align-items: center; gap: 5px; border: 0; border-radius: 6px; padding: 8px 11px; background: transparent; color: var(--text3); font-family: inherit; cursor: pointer; }
        .public-switch button.active { background: var(--bg2); color: var(--primary); box-shadow: var(--shadow-sm); }
        .public-switch .material-symbols-outlined { font-size: 17px; }
        .kanban-scroll { overflow-x: auto; }
        .public-footer { padding: 18px clamp(20px, 5vw, 72px); border-top: 1px solid var(--border); color: var(--text3); font-size: 11px; text-align: center; }
        @media (max-width: 640px) { .public-title { align-items: flex-start; flex-direction: column; } .readonly { display: none; } }
      `}</style>
    </main>
  );
}
