"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import { GanttBoard } from "./GanttBoard";
import { TaskModal } from "./TaskModal";
import { ColumnModal } from "./ColumnModal";
import { ShareBoardModal } from "./ShareBoardModal";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { Board, BoardColumn, Task, UserWithStats } from "@/lib/types";

export function BoardView({
  boardId,
  lockOwnerId,
  filterAssigneeId,
  canEdit,
}: {
  boardId: number;
  lockOwnerId?: number;
  filterAssigneeId?: number;
  canEdit?: boolean;
}) {
  const { user, isAdmin } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "gantt">("kanban");
  const [shareModal, setShareModal] = useState(false);

  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultCol, setDefaultCol] = useState<number | null>(null);

  const [colModal, setColModal] = useState(false);
  const [editingCol, setEditingCol] = useState<BoardColumn | null>(null);

  const loadBoard = useCallback(() => {
    api.getBoard(boardId).then(setBoard).catch(() => {});
    api.listTasks(boardId, filterAssigneeId).then(setTasks).catch(() => {});
  }, [boardId, filterAssigneeId]);

  useEffect(() => {
    loadBoard();
    api.listUsers().then(setUsers).catch(() => {});
    setLoading(false);
  }, [loadBoard]);

  if (loading || !board) return <div style={{ color: "var(--text3)" }}>Загрузка…</div>;

  const sharedBoard = board.kind === "backend_queue" || board.kind === "qcc";
  const canEditColumns = canEdit !== undefined
    ? canEdit
    : (isAdmin || sharedBoard
      || (board.kind === "personal" && board.owner_id === user?.id)
      || (board.kind === "founder" && !!user?.is_founder));
  const canAddTask = canEditColumns;

  function openAddTask(colId: number) { setEditingTask(null); setDefaultCol(colId); setTaskModal(true); }
  function openEditTask(t: Task) { setEditingTask(t); setTaskModal(true); }
  function openEditCol(c: BoardColumn) { setEditingCol(c); setColModal(true); }
  function openAddCol() { setEditingCol(null); setColModal(true); }

  return (
    <>
      <div className="board-toolbar">
        <div className="board-view-switch" role="group" aria-label="Представление доски">
          <button className={viewMode === "kanban" ? "active" : ""} onClick={() => setViewMode("kanban")}>
            <span className="material-symbols-outlined">view_kanban</span> Kanban
          </button>
          <button className={viewMode === "gantt" ? "active" : ""} onClick={() => setViewMode("gantt")}>
            <span className="material-symbols-outlined">view_timeline</span> Gantt
          </button>
        </div>
        {canEditColumns && (
          <button className="board-share" onClick={() => setShareModal(true)}>
            <span className="material-symbols-outlined">ios_share</span>
            Поделиться
          </button>
        )}
      </div>

      {viewMode === "kanban" ? (
        <KanbanBoard
          board={board}
          tasks={tasks}
          canEditColumns={canEditColumns}
          onChange={loadBoard}
          onCardClick={openEditTask}
          onAddTask={canAddTask ? openAddTask : undefined}
          onEditColumn={openEditCol}
          onAddColumn={openAddCol}
        />
      ) : (
        <GanttBoard
          columns={board.columns}
          tasks={tasks}
          onTaskClick={(item) => {
            const task = tasks.find((candidate) => candidate.id === item.id);
            if (task) openEditTask(task);
          }}
        />
      )}
      <TaskModal
        open={taskModal}
        onClose={() => setTaskModal(false)}
        onSaved={loadBoard}
        board={board}
        task={editingTask}
        defaultColumnId={defaultCol}
        lockOwnerId={lockOwnerId}
        users={users}
      />
      <ColumnModal
        open={colModal}
        onClose={() => setColModal(false)}
        onSaved={loadBoard}
        board={board}
        column={editingCol}
      />
      <ShareBoardModal open={shareModal} onClose={() => setShareModal(false)} boardId={board.id} />
      <style jsx>{`
        .board-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .board-view-switch { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg3); }
        .board-view-switch button, .board-share { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 6px; padding: 7px 11px; background: transparent; color: var(--text3); font-family: inherit; font-size: 12px; cursor: pointer; }
        .board-view-switch button.active { background: var(--bg2); color: var(--primary); box-shadow: var(--shadow-sm); }
        .board-view-switch .material-symbols-outlined, .board-share .material-symbols-outlined { font-size: 17px; }
        .board-share { border: 1px solid var(--border); background: var(--bg2); color: var(--text2); }
        .board-share:hover { border-color: var(--primary); color: var(--primary); }
      `}</style>
    </>
  );
}
