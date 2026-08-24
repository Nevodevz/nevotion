"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { STAGE_ACTION_LABELS, stageKind } from "@/components/TransitionModal";
import { fmtDate, fmtMoneyShort } from "@/lib/format";
import type { FunnelCard, LeadStage } from "@/lib/types";
import { DEAL_STATUS } from "@/lib/types";

function isOverdue(s: string | null) {
  return s ? new Date(s) < new Date() : false;
}

type RowHL = "red" | "yellow" | "green" | null;
function rowHighlight(card: FunnelCard, stage: LeadStage | null): RowHL {
  if (stage?.is_won) return "green";
  if (card.next_action_at && isOverdue(card.next_action_at)) return "red";
  if (stage?.norm_days && card.days_in_stage > stage.norm_days) return "yellow";
  return null;
}

function dropdownLabel(s: LeadStage): string {
  const k = stageKind(s);
  return k !== "generic" ? STAGE_ACTION_LABELS[k] : `→ ${s.name}`;
}

function ActionDropdown({
  card, stages, onSelect,
}: {
  card: FunnelCard;
  stages: LeadStage[];
  onSelect: (card: FunnelCard, stage: LeadStage) => void;
}) {
  const [open, setOpen] = useState(false);
  // Archived stages never reach this list — the API already filters them out.
  const available = stages.filter((s) => s.id !== card.stage_id);

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} style={{ whiteSpace: "nowrap" }}>
        Действие
        <span className="material-symbols-outlined" style={{ fontSize: 14, marginLeft: 2 }}>expand_more</span>
      </Button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51,
            background: "var(--bg2)", border: "0.5px solid var(--border)", borderRadius: 10,
            minWidth: 210, boxShadow: "var(--shadow-md)", padding: "4px 0", overflow: "hidden",
          }}>
            {available.map((s) => (
              <button key={s.id}
                onClick={() => { setOpen(false); onSelect(card, s); }}
                style={{
                  width: "100%", padding: "8px 14px", textAlign: "left", background: "transparent",
                  border: "none", cursor: "pointer", fontSize: 13, color: "var(--text)",
                  display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                {dropdownLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StageBar({
  stages, leads, selectedId, onSelect,
}: {
  stages: LeadStage[];
  leads: FunnelCard[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
        {stages.map((stage) => {
          const cards = leads.filter((c) => c.stage_id === stage.id);
          const sum = cards.reduce((s, c) => s + (c.deal_amount || 0), 0);
          const isSelected = stage.id === selectedId;
          return (
            <button key={stage.id} onClick={() => onSelect(stage.id)}
              style={{
                display: "flex", flexDirection: "column", gap: 6, padding: "10px 16px",
                borderRadius: 10, cursor: "pointer",
                border: isSelected ? `2px solid ${stage.color}` : "1px solid var(--border)",
                background: isSelected ? stage.color + "18" : "var(--bg2)",
                textAlign: "left", minWidth: 120, transition: "all 0.15s", fontFamily: "inherit",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                  color: isSelected ? stage.color : "var(--text3)", lineHeight: 1.3,
                }}>
                  {stage.name}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: isSelected ? stage.color : "var(--text)" }}>
                  {cards.length}
                </span>
                {sum > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>
                    {fmtMoneyShort(sum)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FunnelView({
  stages, leads, loading, error, selectedStageId, onSelectStage, onAction, onRetry,
}: {
  stages: LeadStage[];
  leads: FunnelCard[];
  loading: boolean;
  error: string | null;
  selectedStageId: number | null;
  onSelectStage: (id: number) => void;
  onAction: (card: FunnelCard, targetStage: LeadStage) => void;
  onRetry: () => void;
}) {
  const router = useRouter();
  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;
  const stageLeads = leads.filter((c) => c.stage_id === selectedStageId);

  if (error) {
    return (
      <Card>
        <div style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 13 }}>{error}</div>
          <Button size="sm" variant="ghost" onClick={onRetry}>Повторить</Button>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Загрузка…
        </div>
      </Card>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Нет активных этапов. Настройте воронку в разделе «Настройки».
        </div>
      </Card>
    );
  }

  return (
    <>
      <StageBar stages={stages} leads={leads} selectedId={selectedStageId} onSelect={onSelectStage} />

      {!selectedStage || stageLeads.length === 0 ? (
        <Card>
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            {selectedStage ? `Нет лидов на этапе «${selectedStage.name}»` : "Выберите этап"}
          </div>
        </Card>
      ) : (
        <Card padding={0}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--bg3)" }}>
                  {["Клиент", "Источник · Услуга", "Команда", "Сумма сделки", "Оплачено", "Остаток", "Дней", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 14px", textAlign: i >= 3 ? "right" : "left",
                      fontSize: 11, color: "var(--text3)", fontWeight: 600,
                      whiteSpace: "nowrap", borderBottom: "0.5px solid var(--border)",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stageLeads.map((card) => {
                  const hl = rowHighlight(card, selectedStage);
                  const overdue = card.next_action_at ? isOverdue(card.next_action_at) : false;
                  const daysColor = hl === "red" ? "var(--red)" : hl === "yellow" ? "var(--yellow)" : "var(--text3)";
                  const ds = DEAL_STATUS[card.deal_status] ?? DEAL_STATUS.pending;

                  return (
                    <tr key={card.id}
                      style={{ borderBottom: "0.5px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => router.push(`/leads/${card.id}`)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text1)" }}>{card.client_name}</div>
                        {card.company_name && (
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{card.company_name}</div>
                        )}
                        {card.next_action_type && (
                          <div style={{
                            fontSize: 11, color: overdue ? "var(--red)" : "var(--text3)",
                            marginTop: 3, display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                              {overdue ? "warning" : "event"}
                            </span>
                            {card.next_action_type}
                            {card.next_action_at ? ` · ${fmtDate(card.next_action_at)}` : ""}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {card.source && (
                            <span style={{ fontSize: 11, padding: "2px 7px", background: "var(--bg3)", color: "var(--text3)", borderRadius: 4, whiteSpace: "nowrap" }}>
                              {card.source.name}
                            </span>
                          )}
                          {card.service && (
                            <span style={{ fontSize: 11, padding: "2px 7px", background: "var(--primary-dim)", color: "var(--primary)", borderRadius: 4, whiteSpace: "nowrap" }}>
                              {card.service.name}
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, color: "var(--text2)" }}>
                          {card.setter?.name ?? "—"}
                          {card.closer && card.closer.id !== card.setter?.id ? ` → ${card.closer.name}` : ""}
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                          {fmtMoneyShort(card.deal_amount)}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: ds.color }}>
                          {fmtMoneyShort(card.paid_amount)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap", fontSize: 13, color: "var(--text2)" }}>
                        {fmtMoneyShort(card.remaining_amount)}
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: daysColor, whiteSpace: "nowrap" }}>
                          {card.days_in_stage > 0 ? `${card.days_in_stage} д` : "сегодня"}
                          {hl === "yellow" && " ⚠"}
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <ActionDropdown card={card} stages={stages} onSelect={onAction} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
