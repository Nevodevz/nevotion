import type { LeadBoardCard, LeadBoardMove } from "@/lib/types";

export function cardsInColumn(cards: LeadBoardCard[], columnId: number | null): LeadBoardCard[] {
  return cards.filter((card) => card.board_column_id === columnId);
}

/** Insert relative to a visible card, so filtering never invents a global index. */
export function cardMoveTarget(
  cards: LeadBoardCard[], leadId: number, columnId: number | null, overLeadId?: number,
): LeadBoardMove | null {
  const active = cards.find((card) => card.id === leadId);
  if (!active || overLeadId === leadId) return null;
  const target = cardsInColumn(cards, columnId);
  let beforeLeadId: number | null = null;
  if (overLeadId !== undefined) {
    const overIndex = target.findIndex((card) => card.id === overLeadId);
    if (overIndex < 0) return null;
    const activeIndex = target.findIndex((card) => card.id === leadId);
    beforeLeadId = activeIndex >= 0 && activeIndex < overIndex
      ? target[overIndex + 1]?.id ?? null
      : overLeadId;
  } else if (active.board_column_id === columnId && target.at(-1)?.id === leadId) {
    return null;
  }
  return { column_id: columnId, before_lead_id: beforeLeadId, expected_column_id: active.board_column_id };
}
