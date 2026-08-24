"use client";

import { Button, Card, DateRangePicker, Input, Select } from "@/components/ui";
import type {
  LeadFilters, LeadSource, LeadStage, ServiceItem, UserWithStats,
} from "@/lib/types";
import { EMPTY_LEAD_FILTERS } from "@/lib/types";

/**
 * Filters shared by both views of «Лиды и воронка».
 *
 * The parent owns the state, so switching between «Список» and «Воронка» never
 * drops the current selection.
 */
export function LeadFiltersBar({
  filters,
  onChange,
  sources,
  services,
  stages,
  users,
  actions,
  disabled = false,
}: {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  sources: LeadSource[];
  services: ServiceItem[];
  stages: LeadStage[];
  users: UserWithStats[];
  actions?: React.ReactNode;
  disabled?: boolean;
}) {
  const set = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const isDirty = Object.keys(EMPTY_LEAD_FILTERS).some(
    (k) => filters[k as keyof LeadFilters] !== EMPTY_LEAD_FILTERS[k as keyof LeadFilters],
  );

  return (
    <Card padding="12px 16px" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <Input
            icon="search"
            placeholder="Поиск: клиент, телефон, рилс, кампания…"
            value={filters.search}
            disabled={disabled}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <DateRangePicker
          value={{ from: filters.date_from, to: filters.date_to }}
          onChange={(v) => onChange({ ...filters, date_from: v.from, date_to: v.to })}
          onReset={() => onChange({ ...filters, date_from: "", date_to: "" })}
        />

        <div style={{ minWidth: 140 }}>
          <Select value={filters.stage_id} disabled={disabled}
            onChange={(e) => set("stage_id", e.target.value)}>
            <option value="">Все этапы</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <Select value={filters.source_id} disabled={disabled}
            onChange={(e) => set("source_id", e.target.value)}>
            <option value="">Все источники</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>

        <div style={{ minWidth: 130 }}>
          <Select value={filters.service_id} disabled={disabled}
            onChange={(e) => set("service_id", e.target.value)}>
            <option value="">Все услуги</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <Select value={filters.setter_id} disabled={disabled}
            onChange={(e) => set("setter_id", e.target.value)}>
            <option value="">Все сеттеры</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <Select value={filters.closer_id} disabled={disabled}
            onChange={(e) => set("closer_id", e.target.value)}>
            <option value="">Все клоузеры</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </div>

        {isDirty && (
          <Button variant="ghost" size="sm" disabled={disabled}
            onClick={() => onChange({ ...EMPTY_LEAD_FILTERS })}>
            Сбросить
          </Button>
        )}

        {actions}
      </div>
    </Card>
  );
}
