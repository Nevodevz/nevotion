"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Card, Button, Select, DateRangePicker } from "@/components/ui";
import { TransitionModal, stageKind, STAGE_ACTION_LABELS } from "@/components/TransitionModal";
import { useToast } from "@/context/ToastContext";
import { leadApi, settingsApi, api } from "@/lib/api";
import type {
  FunnelCard, FunnelStats, LeadStage, User, LeadSource, RejectReason, FunnelResponse,
} from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────

function fmtMoney(n: number) {
  if (!n) return "—";
  return n.toLocaleString("ru-RU") + " с";
}

function fmtMoneyFull(n: number) {
  if (!n) return "—";
  return n.toLocaleString("ru-RU") + " сом";
}

function fmtDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  const m = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  return `${d.getDate()} ${m[d.getMonth()]}`;
}

function isOverdue(s: string | null) {
  if (!s) return false;
  return new Date(s) < new Date();
}

type RowHL = "red" | "yellow" | "green" | null;
function rowHighlight(card: FunnelCard, stage: LeadStage | null): RowHL {
  if (stage?.is_won) return "green";
  if (card.next_action_at && isOverdue(card.next_action_at)) return "red";
  if (stage?.norm_days && card.days_in_stage > stage.norm_days) return "yellow";
  return null;
}

function getDropdownLabel(s: LeadStage): string {
  const k = stageKind(s);
  return k !== "generic" ? STAGE_ACTION_LABELS[k] : `→ ${s.name}`;
}

// ── ActionDropdown ────────────────────────────────────────────────

function ActionDropdown({
  card,
  stages,
  onSelect,
}: {
  card: FunnelCard;
  stages: LeadStage[];
  onSelect: (card: FunnelCard, stage: LeadStage) => void;
}) {
  const [open, setOpen] = useState(false);
  const available = stages.filter((s) => s.id !== card.stage_id);

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ whiteSpace: "nowrap" }}
      >
        Действие
        <span className="material-symbols-outlined" style={{ fontSize: 14, marginLeft: 2 }}>
          expand_more
        </span>
      </Button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              zIndex: 51,
              background: "var(--bg2)",
              border: "0.5px solid var(--border)",
              borderRadius: 10,
              minWidth: 210,
              boxShadow: "var(--shadow-md)",
              padding: "4px 0",
              overflow: "hidden",
            }}
          >
            {available.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(card, s);
                }}
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }}
                />
                {getDropdownLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card
      padding="14px 18px"
      style={{ minWidth: 130, flex: 1 }}
    >
      <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

// ── Stage Overview Bar ────────────────────────────────────────────

function StageBar({
  stages,
  leads,
  selectedId,
  onSelect,
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
          const count = cards.length;
          const sum = cards.reduce(
            (s, c) => s + (c.active_deal?.amount || c.potential_amount || 0),
            0
          );
          const isSelected = stage.id === selectedId;

          return (
            <button
              key={stage.id}
              onClick={() => onSelect(stage.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
                border: isSelected
                  ? `2px solid ${stage.color}`
                  : "1px solid var(--border)",
                background: isSelected ? stage.color + "18" : "var(--bg2)",
                textAlign: "left",
                minWidth: 120,
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: isSelected ? stage.color : "var(--text3)",
                    lineHeight: 1.3,
                  }}
                >
                  {stage.name}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{ fontSize: 22, fontWeight: 800, color: isSelected ? stage.color : "var(--text)" }}
                >
                  {count}
                </span>
                {sum > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>
                    {fmtMoney(sum)}
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

// ── Lead List ─────────────────────────────────────────────────────

function LeadList({
  leads,
  stage,
  stages,
  onNavigate,
  onAction,
}: {
  leads: FunnelCard[];
  stage: LeadStage | null;
  stages: LeadStage[];
  onNavigate: (id: number) => void;
  onAction: (card: FunnelCard, targetStage: LeadStage) => void;
}) {
  if (!stage) return null;

  if (leads.length === 0) {
    return (
      <Card>
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Нет лидов на этапе «{stage.name}»
        </div>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr style={{ background: "var(--bg3)" }}>
              {["Клиент", "Источник · Услуга", "Команда", "Сумма", "Дней", ""].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "10px 14px",
                    textAlign: i >= 3 ? "right" : "left",
                    fontSize: 11,
                    color: "var(--text3)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    borderBottom: "0.5px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((card) => {
              const hl = rowHighlight(card, stage);
              const overdue = card.next_action_at ? isOverdue(card.next_action_at) : false;
              const daysColor =
                hl === "red" ? "var(--red)" : hl === "yellow" ? "var(--yellow)" : "var(--text3)";

              return (
                <tr
                  key={card.id}
                  style={{ borderBottom: "0.5px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                  onClick={() => onNavigate(card.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text1)" }}>
                      {card.client_name}
                    </div>
                    {card.company_name && (
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                        {card.company_name}
                      </div>
                    )}
                    {card.next_action_type && (
                      <div
                        style={{
                          fontSize: 11,
                          color: overdue ? "var(--red)" : "var(--text3)",
                          marginTop: 3,
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
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
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 7px",
                            background: "var(--bg3)",
                            color: "var(--text3)",
                            borderRadius: 4,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {card.source.name}
                        </span>
                      )}
                      {card.service && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 7px",
                            background: "var(--primary-dim)",
                            color: "var(--primary)",
                            borderRadius: 4,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {card.service.name}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, color: "var(--text2)" }}>
                      {card.setter?.name ?? "—"}
                      {card.closer && card.closer.id !== card.setter?.id
                        ? ` → ${card.closer.name}`
                        : ""}
                    </div>
                  </td>

                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                      {fmtMoneyFull(card.active_deal?.amount || card.potential_amount)}
                    </div>
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
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function FunnelPage() {
  const router = useRouter();
  const showToast = useToast();

  const [data, setData] = useState<FunnelResponse | null>(null);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    card: FunnelCard;
    stage: LeadStage;
  } | null>(null);

  // filters
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [filterSetter, setFilterSetter] = useState<number | undefined>();
  const [filterCloser, setFilterCloser] = useState<number | undefined>();
  const [filterSource, setFilterSource] = useState<number | undefined>();

  const filters = {
    date_from: dateRange.from || undefined,
    date_to: dateRange.to || undefined,
    setter_id: filterSetter,
    closer_id: filterCloser,
    source_id: filterSource,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [funnelData, funnelStats, usersData, rr, srcs] = await Promise.all([
        leadApi.funnel(filters),
        leadApi.funnelStats(filters),
        api.listUsers(),
        settingsApi.listRejectReasons(),
        settingsApi.listSources(),
      ]);
      setData(funnelData);
      setStats(funnelStats);
      setUsers(usersData);
      setRejectReasons(rr);
      setSources(srcs);

      // Auto-select busiest stage on first load
      setSelectedStageId((prev) => {
        if (prev !== null) return prev;
        const busiest = [...funnelData.stages]
          .map((s) => ({
            s,
            count: funnelData.leads.filter((c) => c.stage_id === s.id).length,
          }))
          .sort((a, b) => b.count - a.count)
          .find((x) => x.count > 0);
        return busiest?.s.id ?? funnelData.stages[0]?.id ?? null;
      });
    } catch (e: unknown) {
      showToast((e as Error).message || "Ошибка загрузки", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.from, dateRange.to, filterSetter, filterCloser, filterSource]);

  useEffect(() => {
    load();
  }, [load]);

  const stages = data?.stages ?? [];
  const leads = data?.leads ?? [];
  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;
  const stageLeads = leads.filter((c) => c.stage_id === selectedStageId);

  function handleActionSelect(card: FunnelCard, targetStage: LeadStage) {
    const kind = stageKind(targetStage);
    if (kind === "generic") {
      leadApi
        .changeStage(card.id, targetStage.id)
        .then(() => {
          showToast(`Этап изменён на «${targetStage.name}»`, "success");
          load();
        })
        .catch((err: unknown) =>
          showToast((err as Error).message || "Ошибка смены этапа", "error")
        );
    } else {
      setPendingTransition({ card, stage: targetStage });
    }
  }

  async function handleTransitionConfirm(
    comment: string,
    extra: Record<string, unknown>
  ) {
    if (!pendingTransition) return;
    const { card, stage } = pendingTransition;
    setPendingTransition(null);
    try {
      await leadApi.changeStage(card.id, stage.id, comment, extra);
      showToast(
        stage.is_won ? "Сделка закрыта! Каскад запущен." : `Этап → «${stage.name}»`,
        "success"
      );
      load();
    } catch (err: unknown) {
      showToast((err as Error).message || "Ошибка смены этапа", "error");
    }
  }

  if (loading && !data) {
    return (
      <Shell title="Воронка продаж">
        <div style={{ padding: 60, textAlign: "center", color: "var(--text3)" }}>Загрузка...</div>
      </Shell>
    );
  }

  return (
    <Shell title="Воронка продаж">
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="page-h1">Воронка продаж</div>
          <div className="page-desc">Этапы · Лиды · Переходы</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          onReset={() => setDateRange({ from: "", to: "" })}
        />
        <div style={{ minWidth: 150 }}>
          <Select
            value={String(filterSource || "")}
            onChange={(e) => setFilterSource(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Все источники</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div style={{ minWidth: 150 }}>
          <Select
            value={String(filterSetter || "")}
            onChange={(e) => setFilterSetter(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Все сеттеры</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </div>
        <div style={{ minWidth: 150 }}>
          <Select
            value={String(filterCloser || "")}
            onChange={(e) => setFilterCloser(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Все клоузеры</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </div>
        {(dateRange.from || dateRange.to || filterSetter || filterCloser || filterSource) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateRange({ from: "", to: "" });
              setFilterSetter(undefined);
              setFilterCloser(undefined);
              setFilterSource(undefined);
            }}
          >
            Сбросить
          </Button>
        )}
      </div>

      {/* KPI */}
      {stats && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <KpiCard label="Новых лидов" value={stats.new_leads} />
          <KpiCard label="На встрече" value={stats.meetings_stage} color="var(--primary)" />
          <KpiCard label="Договоров" value={stats.contracts_sent} />
          <KpiCard label="Ожид. оплату" value={stats.waiting_payment} color="var(--yellow)" />
          <KpiCard label="Закрыто" value={stats.closed_won} color="var(--green)" />
          <KpiCard label="Конверсия" value={`${stats.conversion_pct}%`} color="var(--primary)" />
          <KpiCard label="Потенциал" value={fmtMoney(stats.potential_sum)} />
        </div>
      )}

      {/* Stage overview bar */}
      <StageBar
        stages={stages}
        leads={leads}
        selectedId={selectedStageId}
        onSelect={setSelectedStageId}
      />

      {/* Lead list */}
      <LeadList
        leads={stageLeads}
        stage={selectedStage}
        stages={stages}
        onNavigate={(id) => router.push(`/leads/${id}`)}
        onAction={handleActionSelect}
      />

      {/* Transition modal */}
      {pendingTransition && (
        <TransitionModal
          stage={pendingTransition.stage}
          card={pendingTransition.card}
          users={users}
          rejectReasons={rejectReasons}
          onConfirm={handleTransitionConfirm}
          onCancel={() => setPendingTransition(null)}
        />
      )}
    </Shell>
  );
}
