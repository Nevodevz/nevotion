"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import { TaskModal } from "./TaskModal";
import { ColumnModal } from "./ColumnModal";
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
    </>
  );
}
