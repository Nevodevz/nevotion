"use client";

import { BoardColumn, Priority } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const PRIORITY_COLOR: Record<Priority, string> = {
  high: "var(--red)",
  med: "var(--primary)",
  low: "var(--green)",
};

export interface GanttTask {
  id: number;
  title: string;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  column_id: number | null;
}

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, amount: number): Date {
  return new Date(value.getTime() + amount * DAY);
}

function label(value: Date, weekly: boolean): string {
  return value.toLocaleDateString("ru-RU", weekly
    ? { day: "numeric", month: "short", timeZone: "UTC" }
    : { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function GanttBoard({
  columns,
  tasks,
  onTaskClick,
}: {
  columns: BoardColumn[];
  tasks: GanttTask[];
  onTaskClick?: (task: GanttTask) => void;
}) {
  const scheduled = tasks.flatMap((task) => {
    const first = task.start_date || task.due_date;
    const last = task.due_date || task.start_date;
    if (!first || !last) return [];
    const a = parseDay(first);
    const b = parseDay(last);
    return [{ task, start: a <= b ? a : b, end: a <= b ? b : a }];
  });
  const withoutDates = tasks.filter((task) => !task.start_date && !task.due_date);

  if (!scheduled.length) {
    return (
      <div className="gantt-empty">
        <span className="material-symbols-outlined">date_range</span>
        <strong>Для диаграммы нужны даты</strong>
        <span>Укажите начало или срок хотя бы у одной задачи.</span>
        <style jsx>{`
          .gantt-empty { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text3); border: 1px dashed var(--border2); border-radius: 12px; background: var(--bg2); }
          .gantt-empty .material-symbols-outlined { font-size: 32px; }
          .gantt-empty strong { color: var(--text2); }
          .gantt-empty span:last-child { font-size: 13px; }
        `}</style>
      </div>
    );
  }

  const earliest = new Date(Math.min(...scheduled.map((item) => item.start.getTime())));
  const latest = new Date(Math.max(...scheduled.map((item) => item.end.getTime())));
  const rangeStart = addDays(earliest, -1);
  const rangeEnd = addDays(latest, 1);
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY) + 1);
  const stepDays = totalDays > 120 ? 7 : 1;
  const cellWidth = stepDays === 1 ? 42 : 72;
  const units = Math.ceil(totalDays / stepDays);
  const timelineWidth = Math.max(720, units * cellWidth);
  const pxPerDay = timelineWidth / totalDays;
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayOffset = (today.getTime() - rangeStart.getTime()) / DAY;
  const colById = new Map(columns.map((column) => [column.id, column]));

  return (
    <div className="gantt-shell">
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ width: 260 + timelineWidth }}>
          <div className="gantt-corner">Задача</div>
          <div className="gantt-header" style={{ width: timelineWidth }}>
            {Array.from({ length: units }, (_, index) => {
              const day = addDays(rangeStart, index * stepDays);
              return (
                <div key={day.toISOString()} className="gantt-tick" style={{ width: cellWidth }}>
                  {label(day, stepDays > 1)}
                </div>
              );
            })}
          </div>

          {scheduled.map(({ task, start, end }) => {
            const left = ((start.getTime() - rangeStart.getTime()) / DAY) * pxPerDay;
            const width = Math.max(18, (((end.getTime() - start.getTime()) / DAY) + 1) * pxPerDay);
            const column = task.column_id ? colById.get(task.column_id) : undefined;
            return (
              <div key={task.id} className="gantt-row-wrap">
                <button className="gantt-name" onClick={() => onTaskClick?.(task)} disabled={!onTaskClick}>
                  <span className="gantt-title">{task.title}</span>
                  <span className="gantt-meta">
                    {column?.name || "Без колонки"} · {isoDay(start)} — {isoDay(end)}
                  </span>
                </button>
                <div className="gantt-track" style={{ width: timelineWidth }}>
                  {todayOffset >= 0 && todayOffset <= totalDays && (
                    <span className="gantt-today" style={{ left: todayOffset * pxPerDay }} title="Сегодня" />
                  )}
                  <button
                    className={`gantt-bar${task.completed_at ? " done" : ""}`}
                    style={{ left, width, background: PRIORITY_COLOR[task.priority] }}
                    onClick={() => onTaskClick?.(task)}
                    disabled={!onTaskClick}
                    title={`${task.title}: ${isoDay(start)} — ${isoDay(end)}`}
                  >
                    {width > 90 ? task.title : ""}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {withoutDates.length > 0 && (
        <div className="gantt-undated">
          <strong>Без дат: {withoutDates.length}</strong>
          {withoutDates.map((task) => (
            <button key={task.id} onClick={() => onTaskClick?.(task)} disabled={!onTaskClick}>
              {task.title}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .gantt-shell { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg2); }
        .gantt-scroll { overflow-x: auto; }
        .gantt-grid { min-width: 100%; }
        .gantt-corner { position: sticky; left: 0; z-index: 4; width: 260px; height: 44px; float: left; display: flex; align-items: center; padding: 0 16px; background: var(--bg3); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); color: var(--text2); font-size: 12px; font-weight: 700; text-transform: uppercase; box-sizing: border-box; }
        .gantt-header { height: 44px; margin-left: 260px; display: flex; background: var(--bg3); border-bottom: 1px solid var(--border); }
        .gantt-tick { flex: none; display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--border); color: var(--text3); font-size: 10px; white-space: nowrap; box-sizing: border-box; }
        .gantt-row-wrap { display: grid; grid-template-columns: 260px auto; min-height: 58px; border-bottom: 1px solid var(--border); }
        .gantt-row-wrap:last-child { border-bottom: none; }
        .gantt-name { position: sticky; left: 0; z-index: 3; border: 0; border-right: 1px solid var(--border); background: var(--bg2); padding: 9px 16px; text-align: left; font-family: inherit; color: var(--text); display: flex; flex-direction: column; justify-content: center; min-width: 0; }
        .gantt-name:not(:disabled) { cursor: pointer; }
        .gantt-name:not(:disabled):hover .gantt-title { color: var(--primary); }
        .gantt-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gantt-meta { margin-top: 4px; color: var(--text3); font-size: 10px; }
        .gantt-track { position: relative; min-height: 58px; background-image: linear-gradient(to right, var(--border) 1px, transparent 1px); background-size: ${cellWidth}px 100%; }
        .gantt-bar { position: absolute; top: 16px; height: 26px; border: 0; border-radius: 6px; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: white; font-family: inherit; font-size: 10px; font-weight: 600; text-align: left; box-shadow: 0 2px 6px rgba(0,0,0,0.13); }
        .gantt-bar:not(:disabled) { cursor: pointer; }
        .gantt-bar.done { opacity: 0.48; }
        .gantt-today { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red); opacity: 0.55; z-index: 1; pointer-events: none; }
        .gantt-undated { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border); color: var(--text3); font-size: 11px; }
        .gantt-undated button { border: 1px solid var(--border); border-radius: 16px; background: var(--bg3); color: var(--text2); padding: 4px 9px; font-family: inherit; font-size: 11px; }
        .gantt-undated button:not(:disabled) { cursor: pointer; }
      `}</style>
    </div>
  );
}
