"use client";

import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, DragStartEvent, DragEndEvent, useDroppable,
  UniqueIdentifier, CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { Task, Board, BoardColumn, tagColorStyle } from "@/lib/types";
import { Avatar } from "./Avatar";

const PRIORITY_COLOR: Record<string, string> = { high: "var(--red)", med: "var(--yellow)", low: "var(--green)" };

function fmtDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const m = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  return `${dt.getDate()} ${m[dt.getMonth()]}`;
}
function isOverdue(d: string | null): boolean {
  if (!d) return false;
  const dt = new Date(d); const t = new Date(); t.setHours(0,0,0,0);
  return dt < t;
}

function Card({ task, canMove, onClick, doneColIds }: {
  task: Task; canMove: boolean; onClick: () => void; doneColIds: Set<number>;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } =
    useSortable({ id: task.id, disabled: !canMove });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tag = tagColorStyle(task.tag_color);
  const isDone = task.column_id ? doneColIds.has(task.column_id) : false;
  const overdue = isOverdue(task.due_date) && !isDone;
  const showRequester = task.requester && task.requester.id !== task.owner_id;

  return (
    <div
      ref={setNodeRef}
      className="kcard"
      style={{ ...style, opacity: isDragging ? 0.35 : isDone ? 0.75 : 1 }}
      onClick={onClick}
      {...attributes}
      {...(canMove ? listeners : {})}
    >
      <div className="kcard-head">
        <span className="kcard-tag" style={{ background: tag.bg, color: tag.fg }}>{task.tag}</span>
        <button className="kcard-more" onClick={(e) => { e.stopPropagation(); onClick(); }} title="Открыть">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>more_horiz</span>
        </button>
      </div>

      <div className="kcard-title">{task.title}</div>

      {task.description && (
        <div className="kcard-desc-wrap">
          <div className="kcard-desc">{task.description}</div>
          <div className="kcard-desc-fade" />
        </div>
      )}

      {task.task_type && (
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>{task.task_type}</div>
      )}

      <div className="kcard-footer">
        <span className="kcard-date" style={{ color: overdue ? "var(--red)" : "var(--text3)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            {isDone ? "check_circle" : overdue ? "warning" : "calendar_today"}
          </span>
          {task.completed_at ? `Готово ${fmtDate(task.completed_at)}` : overdue ? "Просрочено" : fmtDate(task.due_date)}
        </span>

        {showRequester && (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 20,
            background: "var(--bg3)", color: "var(--text2)",
            border: "1px solid var(--border)", whiteSpace: "nowrap",
          }}>
            от {task.requester!.name}
          </span>
        )}

        {task.assignee_ids && task.assignee_ids.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>engineering</span>
            {task.assignee_ids.length}
          </span>
        )}

        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {!canMove && <span className="material-symbols-outlined" style={{ fontSize: 13, color: "var(--text3)" }}>lock</span>}
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLOR[task.priority], flexShrink: 0 }} />
          {task.owner && <Avatar name={task.owner.name} color={task.owner.avatar_color} size={24} />}
        </span>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

function Column({ col, tasks, canMoveTask, onCardClick, onAdd, canEdit, onEditCol, doneColIds }: {
  col: BoardColumn; tasks: Task[]; canMoveTask: (t: Task) => boolean;
  onCardClick: (t: Task) => void; onAdd: (colId: number) => void;
  canEdit: boolean; onEditCol: (c: BoardColumn) => void; doneColIds: Set<number>;
}) {
  // Column body: droppable zone for tasks (unique string ID to avoid collision with col sortable)
  const { setNodeRef: bodyRef, isOver } = useDroppable({ id: `colbody-${col.id}` });

  // Column header: sortable handle for column reorder
  const {
    attributes: colAttr, listeners: colListeners, setNodeRef: colRef,
    transform, transition, isDragging: colDragging,
  } = useSortable({ id: `col-${col.id}`, disabled: !canEdit });

  const colStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: colDragging ? 0.5 : 1,
  };

  const [page, setPage] = useState(1);
  const visible = tasks.slice(0, page * PAGE_SIZE);
  const hasMore = tasks.length > visible.length;

  return (
    <div ref={colRef} className="kcol" style={colStyle}>
      <div
        className="kcol-head"
        ref={canEdit ? undefined : undefined}
        {...(canEdit ? { ...colListeners, ...colAttr } : {})}
        style={{ cursor: canEdit ? "grab" : "default" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
        <span className="kcol-name">{col.name}</span>
        <span className="kcol-count">{tasks.length}</span>
        <button className="kcol-edit"
          onClick={(e) => { e.stopPropagation(); onAdd(col.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Добавить задачу">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
        </button>
        {canEdit && (
          <button className="kcol-edit"
            onClick={(e) => { e.stopPropagation(); onEditCol(col); }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Настроить колонку">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>more_horiz</span>
          </button>
        )}
      </div>
      <div ref={bodyRef} className="kcol-body" style={{ background: isOver ? "var(--primary-dim)" : "transparent" }}>
        <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visible.map((t) => (
            <Card key={t.id} task={t} canMove={canMoveTask(t)} onClick={() => onCardClick(t)} doneColIds={doneColIds} />
          ))}
        </SortableContext>
        {isOver && <div className="kcol-drop">Перетащите сюда</div>}
        {hasMore && (
          <button onClick={(e) => { e.stopPropagation(); setPage(p => p + 1); }} className="kcol-loadmore">
            Загрузить ещё ({tasks.length - visible.length})
          </button>
        )}
      </div>
      <button className="kcol-add" onClick={() => onAdd(col.id)}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Добавить
      </button>
    </div>
  );
}

export function KanbanBoard({ board, tasks: initialTasks, canEditColumns, onChange, onCardClick, onAddTask, onEditColumn, onAddColumn }: {
  board: Board;
  tasks: Task[];
  canEditColumns: boolean;
  onChange?: () => void;
  onCardClick?: (t: Task) => void;
  onAddTask?: (colId: number) => void;
  onEditColumn?: (c: BoardColumn) => void;
  onAddColumn?: () => void;
}) {
  const { user, isAdmin } = useApp();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Sync tasks when parent data changes (but not while dragging)
  if (activeId === null) {
    const a = initialTasks.map((t) => `${t.id}:${t.column_id}`).join();
    const b = tasks.map((t) => `${t.id}:${t.column_id}`).join();
    if (a !== b) setTasks(initialTasks);
  }

  // Custom collision: when dragging a column only match col-* droppables;
  // when dragging a task use closestCenter restricted to tasks + colbody droppables.
  const collisionDetection: CollisionDetection = (args) => {
    const activeId = args.active.id;
    if (typeof activeId === "string" && activeId.startsWith("col-")) {
      const colDroppables = args.droppableContainers.filter(
        (c) => typeof c.id === "string" && (c.id as string).startsWith("col-"),
      );
      return closestCenter({ ...args, droppableContainers: colDroppables });
    }
    const taskDroppables = args.droppableContainers.filter(
      (c) => typeof c.id === "number" || (typeof c.id === "string" && (c.id as string).startsWith("colbody-")),
    );
    return closestCenter({ ...args, droppableContainers: taskDroppables });
  };

  const sharedBoard = board.kind === "backend_queue" || board.kind === "qcc";
  const doneColIds = new Set(board.columns.filter((c) => c.is_done).map((c) => c.id));
  const canMoveTask = (t: Task) =>
    isAdmin || sharedBoard || t.owner_id === user?.id || board.owner_id === user?.id;
  const cols = [...board.columns].sort((a, b) => a.position - b.position);

  // Require 8px movement to distinguish click from drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleStart(e: DragStartEvent) {
    setActiveId(e.active.id);
  }

  async function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // ── Column reorder ──
    if (typeof activeId === "string" && activeId.startsWith("col-")) {
      if (typeof overId !== "string" || !overId.startsWith("col-")) return;
      const activeCid = Number(activeId.slice(4));
      const overCid = Number(overId.slice(4));
      if (activeCid === overCid) return;

      const oldIdx = cols.findIndex((c) => c.id === activeCid);
      const newIdx = cols.findIndex((c) => c.id === overCid);
      if (oldIdx === -1 || newIdx === -1) return;

      try {
        await api.reorderColumn(activeCid, newIdx);
        onChange?.();
      } catch {}
      return;
    }

    // ── Task drag ──
    const taskId = Number(activeId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    let newColId: number;
    let targetPosition: number;

    if (typeof overId === "string" && overId.startsWith("colbody-")) {
      // Dropped directly on column body (empty area)
      newColId = Number(overId.slice(8));
      const colTasks = tasks.filter((t) => t.column_id === newColId && t.id !== taskId)
        .sort((a, b) => a.position - b.position);
      targetPosition = colTasks.length;
    } else if (typeof overId === "number") {
      // Dropped on another task
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      newColId = overTask.column_id ?? (task.column_id ?? 0);
      const colTasks = tasks.filter((t) => t.column_id === newColId && t.id !== taskId)
        .sort((a, b) => a.position - b.position);
      const overIdx = colTasks.findIndex((t) => t.id === overId);
      targetPosition = overIdx >= 0 ? overIdx : colTasks.length;
    } else {
      return;
    }

    if (!newColId) return;

    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, column_id: newColId } : t)));
    try {
      await api.moveTask(taskId, newColId, targetPosition);
      onChange?.();
    } catch {
      setTasks(prev);
    }
  }

  const isColDrag = typeof activeId === "string" && activeId.startsWith("col-");
  const activeTask = !isColDrag && activeId ? tasks.find((t) => t.id === Number(activeId)) : null;
  const activeCol = isColDrag ? cols.find((c) => c.id === Number(String(activeId).slice(4))) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleStart} onDragEnd={handleEnd}>
      <SortableContext items={cols.map((c) => `col-${c.id}`)} strategy={horizontalListSortingStrategy}>
        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 14, minWidth: "max-content", alignItems: "flex-start" }}>
            {cols.map((col) => (
              <Column key={col.id} col={col}
                tasks={tasks.filter((t) => t.column_id === col.id)}
                canMoveTask={canMoveTask}
                onCardClick={(t) => onCardClick?.(t)}
                onAdd={(c) => onAddTask?.(c)}
                canEdit={canEditColumns}
                onEditCol={(c) => onEditColumn?.(c)}
                doneColIds={doneColIds}
              />
            ))}
            {canEditColumns && (
              <button className="kcol-newcol" onClick={onAddColumn}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Колонка
              </button>
            )}
          </div>
        </div>
      </SortableContext>

      <DragOverlay>
        {activeTask ? (
          <div className="kcard" style={{ boxShadow: "var(--shadow-md)", cursor: "grabbing", width: 264, opacity: 0.95 }}>
            <div className="kcard-title">{activeTask.title}</div>
          </div>
        ) : activeCol ? (
          <div className="kcol" style={{ width: 284, boxShadow: "var(--shadow-md)", cursor: "grabbing", opacity: 0.95 }}>
            <div className="kcol-head">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeCol.color }} />
              <span className="kcol-name">{activeCol.name}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>

      <style jsx global>{`
        .kcol { width: 284px; background: var(--bg3); border-radius: 10px; display: flex; flex-direction: column; }
        .kcol-head { padding: 13px 14px; display: flex; align-items: center; gap: 9px; user-select: none; }
        .kcol-name { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text2); flex: 1; }
        .kcol-count { font-size: 11px; font-family: "JetBrains Mono", monospace; color: var(--text3); background: var(--bg2); padding: 1px 8px; border-radius: 10px; }
        .kcol-edit { width: 24px; height: 24px; border: none; background: transparent; color: var(--text3); border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .kcol-edit:hover { background: var(--bg2); color: var(--text); }
        .kcol-body { padding: 6px 10px; display: flex; flex-direction: column; gap: 9px; flex: 1; min-height: 80px; border-radius: 8px; transition: background 0.15s; }
        .kcol-drop { border: 1.5px dashed var(--primary); border-radius: 8px; padding: 18px; text-align: center; font-size: 12px; color: var(--primary); }
        .kcard { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; transition: border-color 0.15s, box-shadow 0.15s; cursor: grab; }
        .kcard:hover { border-color: var(--primary); box-shadow: 0 2px 12px rgba(70,72,212,0.08); }
        .kcard-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
        .kcard-tag { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 8px; border-radius: 5px; }
        .kcard-more { width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: var(--text3); border-radius: 5px; cursor: pointer; }
        .kcard-more:hover { background: var(--bg3); color: var(--text); }
        .kcard-title { font-size: 14px; font-weight: 500; line-height: 1.4; color: var(--text); margin-bottom: 6px; }
        .kcard-desc-wrap { position: relative; max-height: 36px; overflow: hidden; margin-bottom: 8px; }
        .kcard-desc { font-size: 12px; color: var(--text3); line-height: 1.5; white-space: pre-wrap; }
        .kcard-desc-fade { position: absolute; bottom: 0; left: 0; right: 0; height: 20px; background: linear-gradient(to bottom, transparent, var(--bg2)); pointer-events: none; }
        .kcard-footer { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .kcard-date { font-size: 11px; display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .kcol-loadmore { width: calc(100% - 0px); margin: 0; padding: 7px; font-size: 11px; color: var(--primary); cursor: pointer; border: 1px dashed var(--primary-light, #c0c1ff); background: var(--primary-dim); border-radius: 6px; font-family: inherit; transition: all 0.13s; }
        .kcol-loadmore:hover { opacity: 0.8; }
        .kcol-add { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px; margin: 4px 10px 10px; font-size: 12px; color: var(--text3); cursor: pointer; border: none; background: transparent; border-radius: 6px; font-family: inherit; transition: all 0.13s; }
        .kcol-add:hover { background: var(--bg2); color: var(--text2); }
        .kcol-newcol { width: 150px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 13px; font-size: 13px; color: var(--text3); cursor: pointer; border: 1.5px dashed var(--border2); background: transparent; border-radius: 10px; font-family: inherit; transition: all 0.13s; }
        .kcol-newcol:hover { border-color: var(--primary); color: var(--primary); }
      `}</style>
    </DndContext>
  );
}
