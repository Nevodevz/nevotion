"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { useToast } from "@/context/ToastContext";
import { analyticsApi } from "@/lib/api";
import { Button, Input, FormField, Card, PageHeader } from "@/components/ui";

type ExportType = "leads" | "finance" | "payroll";

function ExportCard({
  type, label, desc, icon,
}: {
  type: ExportType; label: string; desc: string; icon: string;
}) {
  const showToast = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  const doExport = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      await analyticsApi.exportXlsx(type, params);
      showToast("Файл скачан", "success");
    } catch (e: any) {
      showToast(e.message || "Ошибка экспорта", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card padding={24}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--accent)" }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, color: "var(--text3)" }}>{desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 140px" }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>С</div>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>По</div>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Сброс</Button>
        )}
      </div>
      <Button variant="primary" icon="download" onClick={doExport} disabled={loading} loading={loading} style={{ alignSelf: "flex-start" }}>
        {loading ? "Экспортируем..." : "Скачать .xlsx"}
      </Button>
      </div>
    </Card>
  );
}

export default function ReportsPage() {
  return (
    <Shell title="Отчёты">
      <PageHeader
        title="Отчёты"
        subtitle="Экспорт данных в Excel"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 900 }}>
        <ExportCard
          type="leads"
          label="Лиды"
          desc="Список лидов с фильтрацией по периоду — клиент, источник, этап, суммы, ответственные."
          icon="person_search"
        />
        <ExportCard
          type="finance"
          label="Финансы"
          desc="Все финансовые транзакции за период — доходы и расходы с категориями."
          icon="account_balance_wallet"
        />
        <ExportCard
          type="payroll"
          label="Зарплаты"
          desc="Расчётные листы сотрудников — оклад, комиссия, бонусы, итого."
          icon="payments"
        />
      </div>
    </Shell>
  );
}
