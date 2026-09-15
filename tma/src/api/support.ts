import { api } from "./client";

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";

export type SupportTopic = "shift" | "payment" | "account" | "safety" | "other";
export type SupportCaseStatus = "open" | "answered" | "closed";

export interface SupportCase {
  id: string;
  number: string;
  topic: SupportTopic;
  text: string;
  status: SupportCaseStatus;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSupportCase extends SupportCase {
  ownerId: string;
  ownerRole: string;
  ownerInfo: string;
}

const demoCases: AdminSupportCase[] = [];

function demoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function createSupportCase(
  topic: SupportTopic,
  text: string,
): Promise<SupportCase> {
  if (!USE_BACKEND) {
    const id = demoId();
    const now = new Date().toISOString();
    const row: AdminSupportCase = {
      id,
      number: `SS-${id.slice(0, 8).toUpperCase()}`,
      ownerId: "me",
      ownerRole: "seeker",
      ownerInfo: "Демо-пользователь",
      topic,
      text: text.trim(),
      status: "open",
      adminReply: null,
      createdAt: now,
      updatedAt: now,
    };
    demoCases.unshift(row);
    return { ...row };
  }

  const { data } = await api.post<SupportCase>("/support/cases", { topic, text });
  return data;
}

export async function fetchSupportCases(): Promise<SupportCase[]> {
  if (!USE_BACKEND) return demoCases.map((row) => ({ ...row }));
  const { data } = await api.get<SupportCase[]>("/support/cases");
  return data;
}

export async function fetchAdminSupport(
  status: "open" | "all" = "open",
): Promise<AdminSupportCase[]> {
  if (!USE_BACKEND) {
    const rows =
      status === "open"
        ? demoCases.filter((row) => row.status !== "closed")
        : demoCases;
    return rows.map((row) => ({ ...row }));
  }

  const { data } = await api.get<AdminSupportCase[]>("/admin/support", {
    params: { status },
  });
  return data;
}

export async function replySupportCase(
  id: string,
  reply: string,
): Promise<AdminSupportCase> {
  if (!USE_BACKEND) {
    const row = demoCases.find((item) => item.id === id);
    if (!row) throw new Error("Обращение не найдено");
    row.adminReply = reply.trim();
    row.status = "answered";
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }

  const { data } = await api.post<AdminSupportCase>(
    `/admin/support/${id}/reply`,
    { reply },
  );
  return data;
}

export async function closeSupportCase(
  id: string,
  reply = "",
): Promise<AdminSupportCase> {
  if (!USE_BACKEND) {
    const row = demoCases.find((item) => item.id === id);
    if (!row) throw new Error("Обращение не найдено");
    const finalReply = reply.trim();
    if (finalReply) row.adminReply = finalReply;
    row.status = "closed";
    row.updatedAt = new Date().toISOString();
    return { ...row };
  }

  const { data } = await api.post<AdminSupportCase>(
    `/admin/support/${id}/close`,
    reply ? { reply } : {},
  );
  return data;
}
