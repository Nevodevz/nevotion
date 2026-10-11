"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, pointerWithin, useDroppable, useDndContext,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/Modal";
import { Button, Input, ConfirmModal } from "@/components/ui";
import { StageBadge } from "./LeadListView";
import { cardsInColumn, cardMoveTarget } from "./lead-board-layout";
import { fmtDateTime, fmtMoneyShort } from "@/lib/format";
import type { LeadBoardCard, LeadBoardColumn, LeadBoardData, LeadBoardMove } from "@/lib/types";

const COLORS = ["#4648d4", "#16a34a", "#ca8a04", "#b55d00", "#ba1a1a", "#0891b2", "#767586"];

interface Props {
  data: LeadBoardData;
  disabled: boolean;
  canManageColumns: boolean;
  onMoveCard: (id: number, move: LeadBoardMove) => Promise<boolean>;
  onMoveColumn: (id: number, beforeId: number | null) => Promise<boolean>;
  onSaveColumn: (column: LeadBoardColumn | null, values: { name: string; color: string }) => Promise<boolean>;
  onDeleteColumn: (id: number) => Promise<boolean>;
}

function CardContent({ card }: { card: LeadBoardCard }) {
  return <>
    <Link href={`/leads/${card.id}`} className="lead-board-title">{card.client_name || "Лид без имени"}</Link>
    {card.company_name && <div className="lead-board-company">{card.company_name}</div>}
    {card.phone && <div className="lead-board-meta">{card.phone}</div>}
    <div className="lead-board-stage" title="Этап воронки"><StageBadge stage={card.stage} /></div>
    {(card.setter || card.closer) && <div className="lead-board-meta">
      {card.setter && <div>Сеттер: {card.setter.name}</div>}
      {card.closer && <div>Клоузер: {card.closer.name}</div>}
    </div>}
    {card.next_action_at && <div className="lead-board-next">Следующий шаг: {fmtDateTime(card.next_action_at)}</div>}
    {card.deal_amount > 0 && <div className="lead-board-money">{fmtMoneyShort(card.deal_amount)}</div>}
  </>;
}

function LeadCard({ card, columns, disabled, onMove }: {
  card: LeadBoardCard; columns: LeadBoardColumn[]; disabled: boolean;
  onMove: Props["onMoveCard"];
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `lead-${card.id}`, disabled, data: { type: "lead", leadId: card.id, columnId: card.board_column_id },
  });
  return <article ref={setNodeRef} className="lead-board-card" data-lead-id={card.id}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
    <div className="lead-board-card-tools">
      <button ref={setActivatorNodeRef} className="lead-board-handle" disabled={disabled}
        aria-label={`Перетащить лид «${card.client_name}»`} title="Перетащить лид" {...attributes} {...listeners}>
        <span className="material-symbols-outlined">drag_indicator</span>
      </button>
      <select aria-label={`Переместить лид «${card.client_name}»`} disabled={disabled}
        value={card.board_column_id ?? "none"} onChange={(event) => {
          const columnId = event.target.value === "none" ? null : Number(event.target.value);
          if (columnId !== card.board_column_id) onMove(card.id, { column_id: columnId, before_lead_id: null, expected_column_id: card.board_column_id });
        }}>
        <option value="none">Без столбца</option>
        {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
      </select>
    </div>
    <CardContent card={card} />
  </article>;
}

function Column({ column, cards, columns, disabled, canManage, onEdit, onMove }: {
  column: LeadBoardColumn | null; cards: LeadBoardCard[]; columns: LeadBoardColumn[];
  disabled: boolean; canManage: boolean; onEdit: (column: LeadBoardColumn) => void; onMove: Props["onMoveCard"];
}) {
  const [limit, setLimit] = useState(30);
  const id = column?.id ?? null;
  const { setNodeRef: laneRef, isOver } = useDroppable({ id: `lane-${id ?? "none"}`, disabled, data: { type: "lane", columnId: id } });
  const { active, over } = useDndContext();
  const receivesCard = active?.data.current?.type === "lead" && over?.data.current?.columnId === id;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column ? `column-${column.id}` : "unassigned-column", disabled: !column || !canManage || disabled,
    data: { type: "column", columnId: id },
  });
  return <section ref={setNodeRef} className="lead-board-column" aria-label={column?.name ?? "Без столбца"}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
    <header className="lead-board-column-head">
      {column && canManage && <button ref={setActivatorNodeRef} className="lead-board-handle" disabled={disabled}
        aria-label={`Перетащить столбец «${column.name}»`} {...attributes} {...listeners}>
        <span className="material-symbols-outlined">drag_indicator</span>
      </button>}
      <span className="lead-board-dot" style={{ background: column?.color ?? "#767586" }} />
      <h2>{column?.name ?? "Без столбца"}</h2>
      <span className="lead-board-count">{cards.length}</span>
      {column && canManage && <button className="lead-board-edit" disabled={disabled}
        aria-label={`Настроить столбец «${column.name}»`} onClick={() => onEdit(column)}>
        <span className="material-symbols-outlined">more_horiz</span>
      </button>}
    </header>
    <div ref={laneRef} className={`lead-board-lane${isOver || receivesCard ? " lead-board-lane-over" : ""}`} data-column-id={id ?? "none"}>
      <SortableContext items={cards.slice(0, limit).map((card) => `lead-${card.id}`)} strategy={verticalListSortingStrategy}>
        {cards.slice(0, limit).map((card) => <LeadCard key={card.id} card={card} columns={columns} disabled={disabled} onMove={onMove} />)}
      </SortableContext>
      {!cards.length && <div className="lead-board-empty">Перетащите лид сюда</div>}
      {cards.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit((value) => value + 30)}>Показать ещё {Math.min(30, cards.length - limit)}</Button>}
    </div>
  </section>;
}

function ColumnEditor({ column, disabled, onSave, onClose, onDelete }: {
  column: LeadBoardColumn | null; disabled: boolean; onSave: Props["onSaveColumn"];
  onClose: () => void; onDelete: (column: LeadBoardColumn) => void;
}) {
  const [name, setName] = useState(column?.name ?? "");
  const [color, setColor] = useState(column?.color ?? COLORS[0]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() && await onSave(column, { name: name.trim(), color })) onClose();
  }
  return <Modal open title={column ? "Настройки столбца" : "Новый столбец"} onClose={() => { if (!disabled) onClose(); }} width={400}>
    <form onSubmit={submit}>
      <label className="lead-board-field-label" htmlFor="lead-column-name">Название столбца</label>
      <Input id="lead-column-name" autoFocus required maxLength={120} disabled={disabled} placeholder="Например, На проверке"
        value={name} onChange={(event) => setName(event.target.value)} />
      <div className="lead-board-field-label" style={{ marginTop: 18 }}>Цвет</div>
      <div className="lead-board-colors">{COLORS.map((value) => <button key={value} type="button" disabled={disabled}
        aria-label={`Цвет ${value}`} aria-pressed={value === color} onClick={() => setColor(value)}
        style={{ background: value, outline: value === color ? "2px solid var(--text)" : "none" }} />)}</div>
      <div className="lead-board-editor-actions">
        {column && <Button type="button" variant="danger" disabled={disabled} onClick={() => onDelete(column)}>Удалить</Button>}
        <Button type="button" variant="ghost" disabled={disabled} onClick={onClose} style={{ marginLeft: "auto" }}>Отмена</Button>
        <Button type="submit" loading={disabled} disabled={!name.trim()}>Сохранить</Button>
      </div>
    </form>
  </Modal>;
}

export function LeadBoard({ data, disabled, canManageColumns, onMoveCard, onMoveColumn, onSaveColumn, onDeleteColumn }: Props) {
  const [activeCard, setActiveCard] = useState<LeadBoardCard | null>(null);
  const [editor, setEditor] = useState<LeadBoardColumn | null | undefined>();
  const [deleting, setDeleting] = useState<LeadBoardColumn | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor));
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "column") {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((target) => target.data.current?.type === "column" && target.data.current?.columnId !== null) });
    }
    const lanes = args.droppableContainers.filter((target) => target.data.current?.type === "lane");
    const hits = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: lanes }) : closestCenter({ ...args, droppableContainers: lanes });
    if (!hits.length) return [];
    const columnId = lanes.find((lane) => lane.id === hits[0].id)?.data.current?.columnId;
    const cards = args.droppableContainers.filter((target) => target.data.current?.type === "lead" && target.data.current?.columnId === columnId);
    return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : hits;
  };
  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    if (disabled || !event.over) return;
    const active = event.active.data.current;
    const over = event.over.data.current;
    if (!active || !over) return;
    if (active.type === "column" && canManageColumns && active.columnId !== over.columnId) {
      const sourceIndex = data.columns.findIndex((column) => column.id === active.columnId);
      const targetIndex = data.columns.findIndex((column) => column.id === over.columnId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const before = sourceIndex < targetIndex ? data.columns[targetIndex + 1]?.id ?? null : over.columnId;
      onMoveColumn(active.columnId, before);
    } else if (active.type === "lead") {
      const move = cardMoveTarget(data.leads, active.leadId, over.columnId, over.type === "lead" ? over.leadId : undefined);
      if (move) onMoveCard(active.leadId, move);
    }
  }
  return <>
    <div className="lead-board-toolbar">
      <span>Лидов на доске: {data.leads.length}</span>
      {canManageColumns && <Button icon="add" variant="ghost" disabled={disabled} onClick={() => setEditor(null)}>Новый столбец</Button>}
    </div>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}
      onDragCancel={() => setActiveCard(null)} onDragStart={(event) => setActiveCard(data.leads.find((card) => card.id === event.active.data.current?.leadId) ?? null)}>
      <div className="lead-board-scroll" aria-label="Канбан лидов" aria-busy={disabled}>
        <div className="lead-board-columns">
          <Column column={null} cards={cardsInColumn(data.leads, null)} columns={data.columns} disabled={disabled} canManage={false} onEdit={setEditor} onMove={onMoveCard} />
          <SortableContext items={data.columns.map((column) => `column-${column.id}`)} strategy={horizontalListSortingStrategy}>
            {data.columns.map((column) => <Column key={column.id} column={column} cards={cardsInColumn(data.leads, column.id)} columns={data.columns}
              disabled={disabled} canManage={canManageColumns} onEdit={setEditor} onMove={onMoveCard} />)}
          </SortableContext>
          {canManageColumns && <button className="lead-board-add-column" disabled={disabled} onClick={() => setEditor(null)}>+ Новый столбец</button>}
        </div>
      </div>
      <DragOverlay>{activeCard ? <article className="lead-board-card lead-board-overlay"><CardContent card={activeCard} /></article> : null}</DragOverlay>
    </DndContext>
    {editor !== undefined && <ColumnEditor key={editor?.id ?? "new"} column={editor} disabled={disabled} onSave={onSaveColumn}
      onClose={() => setEditor(undefined)} onDelete={(column) => { setEditor(undefined); setDeleting(column); }} />}
    <ConfirmModal open={!!deleting} title="Удалить столбец?" variant="danger" confirmLabel="Удалить столбец"
      message={`Столбец «${deleting?.name ?? ""}» будет удалён. Все его лиды останутся на доске в разделе «Без столбца», их этапы воронки сохранятся.`}
      onCancel={() => { if (!disabled) setDeleting(null); }} onConfirm={async () => {
        if (!disabled && deleting && await onDeleteColumn(deleting.id)) setDeleting(null);
      }} />
    <style jsx global>{`
      .lead-board-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; color:var(--text3); font-size:13px; }
      .lead-board-scroll { max-width:100%; overflow-x:auto; padding:4px 2px 16px; }
      .lead-board-columns { display:flex; gap:16px; align-items:flex-start; width:max-content; }
      .lead-board-column { width:290px; flex-shrink:0; background:var(--bg3); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
      .lead-board-column-head { display:flex; align-items:center; gap:8px; padding:12px; min-height:52px; }
      .lead-board-column-head h2 { margin:0; font-size:13px; font-weight:600; color:var(--text); overflow-wrap:anywhere; flex:1; }
      .lead-board-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .lead-board-count { border-radius:6px; padding:2px 6px; background:var(--bg2); font-size:12px; color:var(--text3); }
      .lead-board-lane { min-height:220px; padding:8px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:10px; transition:background .15s; }
      .lead-board-lane-over { background:var(--primary-bg,var(--bg2)); outline:2px solid var(--primary); outline-offset:-2px; }
      .lead-board-card { padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg2); box-shadow:var(--shadow-sm); color:var(--text); }
      .lead-board-card-tools { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
      .lead-board-card-tools select { min-width:0; flex:1; border:1px solid var(--border); border-radius:5px; padding:4px; background:var(--bg2); color:var(--text3); font-size:11px; }
      .lead-board-handle,.lead-board-edit { display:flex; justify-content:center; align-items:center; background:none; border:0; color:var(--text3); padding:2px; border-radius:4px; cursor:pointer; }
      .lead-board-handle { cursor:grab; touch-action:none; }
      .lead-board-handle .material-symbols-outlined,.lead-board-edit .material-symbols-outlined { font-size:18px; }
      .lead-board-handle:focus-visible,.lead-board-edit:focus-visible { outline:2px solid var(--primary); }
      .lead-board-title { display:block; color:var(--text); font-size:14px; font-weight:600; text-decoration:none; overflow-wrap:anywhere; }
      .lead-board-title:hover { color:var(--primary); }
      .lead-board-company { margin-top:4px; color:var(--text2); font-size:12px; overflow-wrap:anywhere; }
      .lead-board-meta { margin-top:6px; font-size:11px; color:var(--text3); }
      .lead-board-stage { margin-top:10px; }
      .lead-board-next { margin-top:10px; font-size:11px; color:var(--text2); }
      .lead-board-money { margin-top:10px; font-size:13px; font-weight:600; }
      .lead-board-empty { padding:28px 10px; text-align:center; color:var(--text3); font-size:12px; border:1px dashed var(--border); border-radius:8px; }
      .lead-board-overlay { width:274px; box-shadow:var(--shadow-md); cursor:grabbing; }
      .lead-board-add-column { width:220px; padding:17px; border:1px dashed var(--border); border-radius:10px; color:var(--text3); background:none; cursor:pointer; font:inherit; font-size:13px; }
      .lead-board-add-column:hover { color:var(--primary); border-color:var(--primary); }
      .lead-board-field-label { display:block; font-size:12px; color:var(--text2); margin-bottom:8px; }
      .lead-board-colors { display:flex; gap:10px; flex-wrap:wrap; }
      .lead-board-colors button { width:28px; height:28px; border-radius:50%; border:2px solid var(--bg2); outline-offset:2px; cursor:pointer; }
      .lead-board-editor-actions { display:flex; gap:8px; margin-top:24px; flex-wrap:wrap; }
      @media (max-width:768px) { .lead-board-column { width:275px; } }
    `}</style>
  </>;
}
