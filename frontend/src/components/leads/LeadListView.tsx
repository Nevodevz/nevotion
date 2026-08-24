"use client";

import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { fmtDate, fmtMoneyShort } from "@/lib/format";
import type { Lead, LeadListResponse, LeadStage } from "@/lib/types";
import { DEAL_STATUS } from "@/lib/types";

export function StageBadge({ stage }: { stage: LeadStage | null }) {
  if (!stage) return <span style={{ color: "var(--text3)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12,
      fontSize: 11, fontWeight: 600,
      background: stage.color + "22", color: stage.color,
    }}>
      {stage.name}
    </span>
  );
}

const HEADERS = [
  "Дата", "Клиент / Компания", "Телефон", "Источник", "Рилс / контент", "Услуга",
  "Этап", "Сеттер", "Клоузер", "Сумма сделки", "Оплачено", "Остаток", "Следующий шаг",
];

/** Truncated link to the reel/post the lead came from. */
function ContentRef({ lead }: { lead: Lead }) {
  const ref = lead.content_ref || lead.utm_content || lead.source_detail;
  if (!ref) return <span style={{ color: "var(--text3)" }}>—</span>;
  const isUrl = /^https?:\/\//i.test(ref);
  const label = ref.length > 24 ? ref.slice(0, 24) + "…" : ref;
  if (!isUrl) return <span style={{ color: "var(--text2)" }}>{label}</span>;
  return (
    <a href={ref} target="_blank" rel="noreferrer" title={ref}
      onClick={(e) => e.stopPropagation()}
      style={{ color: "var(--primary)", textDecoration: "none" }}>
      {label}
    </a>
  );
}

export function LeadListView({
  data, loading, error, offset, limit, onPage, onRetry,
}: {
  data: LeadListResponse;
  loading: boolean;
  error: string | null;
  offset: number;
  limit: number;
  onPage: (nextOffset: number) => void;
  onRetry: () => void;
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <Card padding={0}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
              {HEADERS.map((h) => (
                <th key={h} style={{
                  padding: "10px 12px", textAlign: "left", fontWeight: 600,
                  fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={HEADERS.length} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ color: "var(--red)", marginBottom: 12 }}>{error}</div>
                  <Button size="sm" variant="ghost" onClick={onRetry}>Повторить</Button>
                </td>
              </tr>
            )}
            {!error && loading && (
              <tr>
                <td colSpan={HEADERS.length} style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!error && !loading && data.items.length === 0 && (
              <tr>
                <td colSpan={HEADERS.length} style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
                  Лиды не найдены — измените фильтры или создайте новый лид
                </td>
              </tr>
            )}
            {!error && !loading && data.items.map((lead) => {
              const ds = DEAL_STATUS[lead.deal_status] ?? DEAL_STATUS.pending;
              return (
                <tr key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "10px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                    {fmtDate(lead.created_at)}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{lead.client_name}</div>
                    {lead.company_name && (
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>{lead.company_name}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)", whiteSpace: "nowrap" }}>{lead.phone || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>
                    {lead.source?.name || "—"}
                    {lead.utm_campaign && (
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>{lead.utm_campaign}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", maxWidth: 180 }}><ContentRef lead={lead} /></td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.service?.name || "—"}</td>
                  <td style={{ padding: "10px 12px" }}><StageBadge stage={lead.stage} /></td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.setter?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{lead.closer?.name || "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {fmtMoneyShort(lead.deal_amount)}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ color: ds.color, fontWeight: 600 }}>{fmtMoneyShort(lead.paid_amount)}</span>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--text2)" }}>
                    {fmtMoneyShort(lead.remaining_amount)}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {lead.next_action_type ? (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{lead.next_action_type}</div>
                        {lead.next_action_at && (
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>{fmtDate(lead.next_action_at)}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--red)", fontStyle: "italic" }}>Не задан</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.total > limit && (
        <div style={{
          padding: "12px 16px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>
            {offset + 1}–{Math.min(offset + limit, data.total)} из {data.total}
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Button variant="ghost" size="sm" disabled={loading || page <= 1}
              onClick={() => onPage(offset - limit)}>← Назад</Button>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>Стр. {page} из {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={loading || page >= totalPages}
              onClick={() => onPage(offset + limit)}>Вперёд →</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
