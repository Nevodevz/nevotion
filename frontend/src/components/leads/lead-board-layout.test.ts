import { describe, expect, it } from "vitest";
import { cardMoveTarget, cardsInColumn } from "./lead-board-layout";
import type { LeadBoardCard } from "@/lib/types";

const cards = [
  { id: 1, board_column_id: null, stage_id: 7 },
  { id: 2, board_column_id: 10, stage_id: 7 },
  { id: 3, board_column_id: 10, stage_id: 8 },
  { id: 4, board_column_id: 10, stage_id: 9 },
] as LeadBoardCard[];

describe("independent lead board placement", () => {
  it("groups by working column rather than funnel stage", () => {
    expect(cardsInColumn(cards, 10).map((card) => card.id)).toEqual([2, 3, 4]);
    expect(cardsInColumn(cards, null).map((card) => card.id)).toEqual([1]);
  });
  it("can drop into an empty column with a source-column guard", () => {
    expect(cardMoveTarget(cards, 1, 20)).toEqual({ column_id: 20, before_lead_id: null, expected_column_id: null });
  });
  it("inserts before a visible anchor when a filter hides other cards", () => {
    expect(cardMoveTarget(cards.filter((card) => card.id !== 3), 1, 10, 4)).toEqual({ column_id: 10, before_lead_id: 4, expected_column_id: null });
  });
  it("can reorder downwards within the same column", () => {
    expect(cardMoveTarget(cards, 2, 10, 3)?.before_lead_id).toBe(4);
    expect(cardMoveTarget(cards, 2, 10, 4)?.before_lead_id).toBeNull();
  });
  it("ignores cancelled, self and stale targets", () => {
    expect(cardMoveTarget(cards, 99, 10)).toBeNull();
    expect(cardMoveTarget(cards, 2, 10, 2)).toBeNull();
    expect(cardMoveTarget(cards, 1, 10, 99)).toBeNull();
    expect(cardMoveTarget(cards, 4, 10)).toBeNull();
  });
});
