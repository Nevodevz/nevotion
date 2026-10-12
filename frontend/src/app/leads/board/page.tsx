"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Button, Card } from "@/components/ui";
import { LeadBoard } from "@/components/leads/LeadBoard";
import { LeadFiltersBar } from "@/components/leads/LeadFiltersBar";
import { CreateLeadModal } from "@/components/leads/CreateLeadModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api, leadBoardApi, settingsApi, type LeadQuery } from "@/lib/api";
import { EMPTY_LEAD_FILTERS, type LeadBoardData, type LeadFilters, type LeadSource, type LeadStage, type ServiceItem, type UserWithStats } from "@/lib/types";

function BoardPage() {
  const { user, isAdmin } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<LeadFilters>(() => Object.fromEntries(
    Object.keys(EMPTY_LEAD_FILTERS).map((key) => [key, searchParams.get(key) ?? ""]),
  ) as unknown as LeadFilters);
  const [search, setSearch] = useState(filters.search);
  const [data, setData] = useState<LeadBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const mutationLock = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [creatingLead, setCreatingLead] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(filters.search), 350);
    return () => clearTimeout(timeout);
  }, [filters.search]);
  const query: LeadQuery = useMemo(() => ({
    search, date_from: filters.date_from, date_to: filters.date_to,
    stage_id: filters.stage_id, source_id: filters.source_id, service_id: filters.service_id,
    setter_id: filters.setter_id, closer_id: filters.closer_id,
  }), [search, filters.date_from, filters.date_to, filters.stage_id, filters.source_id,
    filters.service_id, filters.setter_id, filters.closer_id]);
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
    router.replace(`/leads/board${params.size ? `?${params}` : ""}`, { scroll: false });
  }, [query, router]);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const board = await leadBoardApi.get(query);
      if (request === generation.current) setData(board);
    } catch (failure) {
      if (request === generation.current) setError((failure as Error).message || "Не удалось загрузить доску");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    load();
    return () => { generation.current++; };
  }, [load]);
  useEffect(() => {
    Promise.all([settingsApi.listSources(), settingsApi.listServices(), settingsApi.listStages(), api.listUsers()])
      .then(([nextSources, nextServices, nextStages, nextUsers]) => {
        setSources(nextSources); setServices(nextServices); setStages(nextStages); setUsers(nextUsers);
      }).catch(() => toast("Не удалось загрузить справочники для фильтров", "error"));
  }, [toast]);

  async function mutate(operation: () => Promise<unknown>, success: string): Promise<boolean> {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setMutating(true);
    try {
      await operation();
      toast(success, "success");
      await load();
      return true;
    } catch (failure) {
      toast((failure as Error).message || "Не удалось сохранить изменение", "error");
      await load();
      return false;
    } finally {
      mutationLock.current = false;
      setMutating(false);
    }
  }

  return <Shell title="Доска">
    <div className="page-head">
      <div className="page-h1">Доска</div>
      <div className="page-desc">Перетаскивайте лиды между рабочими столбцами. Этап воронки сохраняется.</div>
    </div>
    <LeadFiltersBar filters={filters} onChange={setFilters} sources={sources} services={services} stages={stages} users={users}
      disabled={mutating} actions={<>
        <Button icon="refresh" variant="ghost" disabled={loading || mutating} onClick={load}>Обновить</Button>
        <Button icon="add" disabled={mutating} onClick={() => setCreatingLead(true)}>Новый лид</Button>
      </>} />
    {error && <Card padding="20px" style={{ marginBottom: 16 }}>
      <div role="alert" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>
      <Button variant="ghost" disabled={loading} onClick={load}>Повторить</Button>
    </Card>}
    {!data && loading && <div role="status" style={{ padding: 40, color: "var(--text3)" }}>Загрузка доски…</div>}
    {data && <LeadBoard data={data} disabled={loading || mutating} canManageColumns={isAdmin}
      onMoveCard={(id, move) => mutate(() => leadBoardApi.moveCard(id, move), "Лид перемещён")}
      onMoveColumn={(id, before) => mutate(() => leadBoardApi.moveColumn(id, before), "Порядок столбцов сохранён")}
      onSaveColumn={(column, values) => mutate(
        () => column ? leadBoardApi.updateColumn(column.id, values) : leadBoardApi.createColumn(values),
        column ? "Столбец обновлён" : "Столбец создан",
      )}
      onDeleteColumn={(id) => mutate(() => leadBoardApi.deleteColumn(id), "Столбец удалён, лиды сохранены")} />}
    <CreateLeadModal open={creatingLead} onClose={() => setCreatingLead(false)} onCreated={load}
      sources={sources} services={services} stages={stages} users={users} currentUserId={user?.id} isAdmin={isAdmin} />
  </Shell>;
}

export default function LeadsBoardPage() {
  return <Suspense fallback={<Shell title="Доска"><div style={{ padding: 40 }}>Загрузка доски…</div></Shell>}><BoardPage /></Suspense>;
}
