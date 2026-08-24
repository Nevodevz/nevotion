"use client";

import { BoardColumn, PublicTask, tagColorStyle } from "@/lib/types";

function formatDate(value: string | null): string {
  if (!value) return "Без срока";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PublicKanbanBoard({
  columns,
  tasks,
}: {
  columns: BoardColumn[];
  tasks: PublicTask[];
}) {
  const orderedColumns = [...columns].sort((a, b) => a.position - b.position);
  return (
    <div className="public-kanban">
      {orderedColumns.map((column) => {
        const items = tasks
          .filter((task) => task.column_id === column.id)
          .sort((a, b) => a.position - b.position || a.id - b.id);
        return (
          <section key={column.id} className="public-column">
            <header>
              <span style={{ background: column.color }} />
              <strong>{column.name}</strong>
              <em>{items.length}</em>
            </header>
            <div className="public-cards">
              {items.map((task) => {
                const tag = tagColorStyle(task.tag_color);
                return (
                  <article key={task.id} className={task.completed_at ? "done" : ""}>
                    <div className="public-card-top">
                      <span style={{ background: tag.bg, color: tag.fg }}>{task.tag}</span>
                      <i className={`priority ${task.priority}`} title={`Приоритет: ${task.priority}`} />
                    </div>
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <footer>
                      <span className="material-symbols-outlined">
                        {task.completed_at ? "check_circle" : "event"}
                      </span>
                      {task.start_date && task.start_date !== task.due_date
                        ? `${formatDate(task.start_date)} — ${formatDate(task.due_date)}`
                        : formatDate(task.due_date || task.start_date)}
                    </footer>
                  </article>
                );
              })}
              {!items.length && <div className="empty">Нет задач</div>}
            </div>
          </section>
        );
      })}
      <style jsx>{`
        .public-kanban { display: flex; gap: 14px; align-items: flex-start; min-width: max-content; padding-bottom: 16px; }
        .public-column { width: 286px; background: var(--bg3); border-radius: 12px; overflow: hidden; }
        .public-column > header { display: flex; align-items: center; gap: 9px; padding: 14px; }
        .public-column > header > span { width: 8px; height: 8px; border-radius: 50%; }
        .public-column > header strong { flex: 1; color: var(--text2); font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
        .public-column > header em { font-style: normal; color: var(--text3); font-size: 11px; }
        .public-cards { display: flex; flex-direction: column; gap: 9px; padding: 6px 10px 12px; min-height: 80px; }
        article { padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg2); }
        article.done { opacity: 0.65; }
        .public-card-top { display: flex; align-items: center; gap: 8px; }
        .public-card-top > span { padding: 3px 8px; border-radius: 5px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .priority { width: 7px; height: 7px; margin-left: auto; border-radius: 50%; background: var(--primary); }
        .priority.high { background: var(--red); }
        .priority.low { background: var(--green); }
        h3 { margin: 10px 0 0; color: var(--text); font-size: 14px; line-height: 1.4; }
        p { margin: 7px 0 0; color: var(--text3); font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
        footer { display: flex; align-items: center; gap: 5px; margin-top: 12px; color: var(--text3); font-size: 11px; }
        footer .material-symbols-outlined { font-size: 15px; }
        .empty { padding: 18px; text-align: center; color: var(--text3); font-size: 12px; }
      `}</style>
    </div>
  );
}
