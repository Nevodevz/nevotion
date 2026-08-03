"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Button, Card } from "@/components/ui";
import { CreateLeadModal } from "@/components/leads/CreateLeadModal";
import { FunnelView } from "@/components/leads/FunnelView";
import { LeadFiltersBar } from "@/components/leads/LeadFiltersBar";
import { LeadListView } from "@/components/leads/LeadListView";
import { TransitionModal, stageKind } from "@/components/TransitionModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { analyticsApi, api, leadApi, settingsApi, type LeadQuery } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import type {
  FunnelCard, FunnelStats, LeadFilters, LeadListResponse, LeadSource, LeadStage,
  LeadStats, RejectReason, ServiceItem, UserWithStats,
} from "@/lib/types";
import { EMPTY_LEAD_FILTERS } from "@/lib/types";

type ViewMode = "list" | "funnel";
const LIMIT = 30;

function KpiCard({ label, value, icon, color }: {
  label: string; value: string | number; icon?: string; color?: string;
}) {
  return (
    <Card style={{ minWidth: 140, flex: "1 1 140px" }} padding="16px 20px">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text3)", fontSize: 12, marginBottom: 2 }}>
          {icon && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>}
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: color ?? "var(--text1)" }}>{value}</div>
      </div>
    </Card>
  );
}

/** Two views of the same data — the switch only changes presentation. */
function ViewSwitch({ view, onChange, disabled }: {
  view: ViewMode; onChange: (v: ViewMode) => void; disabled?: boolean;
}) {
  const options: { value: ViewMode; label: string; icon: string }[] = [
    { value: "list", label: "Список", icon: "list" },
    { value: "funnel", label: "Воронка", icon: "filter_alt" },
  ];
  return (
    <div role="tablist" aria-label="Представление"
      style={{ display: "inline-flex", background: "var(--bg3)", borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = view === o.value;
        return (
          <button key={o.value} role="tab" aria-selected={active} disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
              borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: active ? 600 : 400,
              background: active ? "var(--bg2)" : "transparent",
              color: active ? "var(--text)" : "var(--text3)",
              boxShadow: active ? "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08))" : "none",
              opacity: disabled ? 0.6 : 1,
              transition: "all 0.15s",
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function filtersFromParams(params: URLSearchParams): LeadFilters {
  const read = (k: keyof LeadFilters) => params.get(k) ?? "";
  return {
    search: read("search"),
    date_from: read("date_from"),
    date_to: read("date_to"),
    stage_id: read("stage_id"),
    source_id: read("source_id"),
    service_id: read("service_id"),
    setter_id: read("setter_id"),
    closer_id: read("closer_id"),
  };
}

function LeadsPageInner() {
  const { user, isAdmin } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewMode>(
    searchParams.get("view") === "funnel" ? "funnel" : "list",
  );
  // Filters live here, above both views, so switching never loses them.
  const [filters, setFilters] = useState<LeadFilters>(() => filtersFromParams(new URLSearchParams(searchParams.toString())));
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  // Lookups
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);

  // List view
  const [listData, setListData] = useState<LeadListResponse>({ items: [], total: 0 });
  const [offset, setOffset] = useState(0);

  // Funnel view
  const [funnelLeads, setFunnelLeads] = useState<FunnelCard[]>([]);
  const [funnelStages, setFunnelStages] = useState<LeadStage[]>([]);
  const [funnelStats, setFunnelStats] = useState<FunnelStats | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);

  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{ card: FunnelCard; stage: LeadStage } | null>(null);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Mirror view + filters into the URL so the state is shareable and restorable.
  useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "list") p.set("view", view);
    for (const [k, v] of Object.entries({ ...filters, search: debouncedSearch })) {
      if (v) p.set(k, String(v));
    }
    const qs = p.toString();
    router.replace(qs ? `/leads?${qs}` : "/leads", { scroll: false });
    // `router` identity is stable in the app router; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filters.date_from, filters.date_to, filters.stage_id, filters.source_id,
      filters.service_id, filters.setter_id, filters.closer_id, debouncedSearch]);

  const query: LeadQuery = useMemo(() => ({
    search: debouncedSearch || undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    stage_id: filters.stage_id || undefined,
    source_id: filters.source_id || undefined,
    service_id: filters.service_id || undefined,
    setter_id: filters.setter_id || undefined,
    closer_id: filters.closer_id || undefined,
  }), [debouncedSearch, filters.date_from, filters.date_to, filters.stage_id,
       filters.source_id, filters.service_id, filters.setter_id, filters.closer_id]);

  useEffect(() => {
    settingsApi.listSources().then(setSources).catch(() => {});
    settingsApi.listServices().then(setServices).catch(() => {});
    settingsApi.listStages().then(setStages).catch(() => {});
    settingsApi.listRejectReasons().then(setRejectReasons).catch(() => {});
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      if (view === "list") {
        const [data, s] = await Promise.all([
          leadApi.list({ ...query, limit: LIMIT, offset: nextOffset }),
          leadApi.stats({ date_from: filters.date_from || undefined, date_to: filters.date_to || undefined }),
        ]);
        setListData(data);
        setStats(s);
        setOffset(nextOffset);
      } else {
        const [funnel, fStats] = await Promise.all([
          leadApi.funnel(query),
          leadApi.funnelStats(query),
        ]);
        setFunnelLeads(funnel.leads);
        setFunnelStages(funnel.stages);
        setFunnelStats(fStats);
        setSelectedStageId((prev) => {
          if (prev !== null && funnel.stages.some((s) => s.id === prev)) return prev;
          const busiest = funnel.stages
            .map((s) => ({ s, count: funnel.leads.filter((c) => c.stage_id === s.id).length }))
            .sort((a, b) => b.count - a.count)
            .find((x) => x.count > 0);
          return busiest?.s.id ?? funnel.stages[0]?.id ?? null;
        });
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [view, query, filters.date_from, filters.date_to]);

  useEffect(() => { load(0); }, [load]);

  function handleActionSelect(card: FunnelCard, targetStage: LeadStage) {
    if (stageKind(targetStage) === "generic") {
      leadApi.changeStage(card.id, targetStage.id)
        .then(() => { toast(`Этап изменён на «${targetStage.name}»`, "success"); load(offset); })
        .catch((err: unknown) => toast((err as Error).message || "Ошибка смены этапа", "error"));
    } else {
      setPendingTransition({ card, stage: targetStage });
    }
  }

  async function handleTransitionConfirm(comment: string, extra: Record<string, unknown>) {
    if (!pendingTransition) return;
    const { card, stage } = pendingTransition;
    setPendingTransition(null);
    try {
      await leadApi.changeStage(card.id, stage.id, comment, extra);
      toast(stage.is_won ? "Сделка полностью оплачена и закрыта" : `Этап → «${stage.name}»`, "success");
    } catch (err: unknown) {
      // A partial payment is recorded but rejects the stage change — the message
      // explains why, and the data below still needs refreshing.
      toast((err as Error).message || "Ошибка смены этапа", "error");
    }
    load(offset);
  }

  const kpis = view === "list" ? (
    <>
      <KpiCard label="Лидов сегодня" value={stats?.leads_today ?? "—"} icon="today" />
      <KpiCard label="Лидов за период" value={stats?.leads_period ?? "—"} icon="contacts" />
      <KpiCard label="Встреч за период" value={stats?.meetings_period ?? "—"} icon="calendar_month" />
      <KpiCard label="Закрыто в оплату" value={stats?.closed_won ?? "—"} icon="payments" />
      <KpiCard label="Конверсия" value={stats ? `${stats.conversion_pct}%` : "—"} icon="trending_up" />
      <KpiCard label="Сумма сделок" value={stats ? fmtMoneyShort(stats.deals_sum) : "—"} icon="account_balance_wallet" />
      <KpiCard label="Оплачено" value={stats ? fmtMoneyShort(stats.paid_sum) : "—"} icon="paid" color="var(--green)" />
      <KpiCard label="Остаток" value={stats ? fmtMoneyShort(stats.remaining_sum) : "—"} icon="pending" color="var(--yellow)" />
    </>
  ) : (
    <>
      <KpiCard label="Новых лидов" value={funnelStats?.new_leads ?? "—"} />
      <KpiCard label="На встрече" value={funnelStats?.meetings_stage ?? "—"} color="var(--primary)" />
      <KpiCard label="Договоров" value={funnelStats?.contracts_sent ?? "—"} />
      <KpiCard label="Ожид. оплату" value={funnelStats?.waiting_payment ?? "—"} color="var(--yellow)" />
      <KpiCard label="Закрыто" value={funnelStats?.closed_won ?? "—"} color="var(--green)" />
      <KpiCard label="Конверсия" value={funnelStats ? `${funnelStats.conversion_pct}%` : "—"} color="var(--primary)" />
      <KpiCard label="Сумма сделок" value={funnelStats ? fmtMoneyShort(funnelStats.deals_sum) : "—"} />
      <KpiCard label="Остаток" value={funnelStats ? fmtMoneyShort(funnelStats.remaining_sum) : "—"} color="var(--yellow)" />
    </>
  );

  return (
    <Shell title="Лиды и воронка">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="page-h1">Лиды и воронка</div>
          <div className="page-desc">Один список лидов в двух представлениях · фильтры общие</div>
        </div>
        <ViewSwitch view={view} onChange={setView} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>{kpis}</div>

      <LeadFiltersBar
        filters={filters}
        onChange={setFilters}
        sources={sources}
        services={services}
        stages={stages}
        users={users}
        actions={
          <>
            <Button variant="ghost" icon="download" disabled={loading}
              onClick={() => analyticsApi.exportXlsx("leads", {
                ...(filters.date_from ? { date_from: filters.date_from } : {}),
                ...(filters.date_to ? { date_to: filters.date_to } : {}),
              })}>
              Excel
            </Button>
            <Button icon="add" onClick={() => setCreateModal(true)}>Новый лид</Button>
          </>
        }
      />

      {view === "list" ? (
        <LeadListView
          data={listData}
          loading={loading}
          error={error}
          offset={offset}
          limit={LIMIT}
          onPage={(next) => load(next)}
          onRetry={() => load(offset)}
        />
      ) : (
        <FunnelView
          stages={funnelStages}
          leads={funnelLeads}
          loading={loading}
          error={error}
          selectedStageId={selectedStageId}
          onSelectStage={setSelectedStageId}
          onAction={handleActionSelect}
          onRetry={() => load(0)}
        />
      )}

      <CreateLeadModal
        open={createModal}
        onClose={() => setCreateModal(false)}
        onCreated={() => load(0)}
        sources={sources}
        services={services}
        stages={stages}
        users={users}
        currentUserId={user?.id}
        isAdmin={isAdmin}
      />

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

export default function LeadsPage() {
  // useSearchParams needs a Suspense boundary during static rendering.
  return (
    <Suspense fallback={<Shell title="Лиды и воронка"><div style={{ padding: 40, color: "var(--text3)" }}>Загрузка…</div></Shell>}>
      <LeadsPageInner />
    </Suspense>
  );
}
