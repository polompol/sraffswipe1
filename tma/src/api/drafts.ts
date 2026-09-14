import { api, ApiError } from "./client";
import { createVacancy as createDemoVacancy } from "./mock";
import { LS } from "@/lib/storage";
import type { PayMethod, RateType, StaffRole, TipsMode, Vacancy } from "@/types/domain";

export interface DraftFields {
  role: StaffRole;
  date: string | null;
  startTime: number | null;
  endTime: number | null;
  rate: number | null;
  rateType: RateType;
  headcount: number;
  payMethod: PayMethod;
  tips: TipsMode;
  description: string;
  requireMedBook: boolean;
  requireExperience: boolean;
  lat: number;
  lng: number;
  address: string;
  city: string;
  interiorPhotoUrl: string;
  step: number;
}

export interface VacancyDraft {
  id: string;
  version: number;
  data: DraftFields;
  updatedAt: string;
}

export function draftInput(d: DraftFields) {
  return {
    role: d.role, date: d.date, start_time: d.startTime, end_time: d.endTime,
    rate: d.rate, rate_type: d.rateType, headcount: d.headcount,
    pay_method: d.payMethod, tips: d.tips, description: d.description,
    require_med_book: d.requireMedBook, require_experience: d.requireExperience,
    lat: d.lat, lng: d.lng, address: d.address, city: d.city,
    interior_photo_url: d.interiorPhotoUrl, step: d.step,
  };
}

/** Сравнение полей не зависит от порядка ключей в ответе сервера и шага UI. */
export function draftSnapshot(d: DraftFields): string {
  return JSON.stringify({ ...draftInput(d), step: 0 });
}

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";
type DemoDraft = VacancyDraft & { published?: Vacancy; deleted?: boolean };
// Только явно обозначенное демо. Рабочие черновики всегда хранятся на сервере.
const demoKey = () => `${LS.demoDrafts}:${localStorage.getItem(LS.uid) ?? "demo"}`;
function demoRows(): DemoDraft[] {
  const stored = localStorage.getItem(demoKey());
  return stored ? JSON.parse(stored) : [];
}
function demoWrite(rows: DemoDraft[]) { localStorage.setItem(demoKey(), JSON.stringify(rows)); }
function fail(status: number, detail: string): never {
  throw new ApiError(detail, { method: "PUT", url: "/vacancy-drafts" }, { status, data: { detail } });
}

export async function fetchDrafts(): Promise<VacancyDraft[]> {
  if (!USE_BACKEND) return demoRows().filter(d => !d.published && !d.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (await api.get<VacancyDraft[]>("/vacancy-drafts")).data;
}

export async function fetchDraft(id: string): Promise<VacancyDraft> {
  if (!USE_BACKEND) {
    const d = (await fetchDrafts()).find(d => d.id === id);
    return d ?? fail(404, "Черновик не найден");
  }
  return (await api.get<VacancyDraft>(`/vacancy-drafts/${id}`)).data;
}

export async function saveDraft(id: string, version: number, data: DraftFields): Promise<VacancyDraft> {
  if (!USE_BACKEND) {
    const rows = demoRows();
    const existing = rows.find(d => d.id === id);
    if (existing?.deleted) fail(404, "Черновик удалён");
    if (existing?.published) fail(409, "Черновик уже опубликован. Откройте «Мои смены».");
    if (existing?.version === version + 1 && JSON.stringify(draftInput(existing.data)) === JSON.stringify(draftInput(data))) return existing;
    if ((existing?.version ?? 0) !== version) fail(409, "Черновик изменён на другом устройстве. Откройте свежую версию из списка; ваши поля пока остаются на экране.");
    if (!existing && rows.filter(d => !d.published && !d.deleted).length >= 50) fail(409, "Можно сохранить до 50 черновиков.");
    const result = { id, version: version + 1, data, updatedAt: new Date().toISOString() };
    demoWrite([...rows.filter(d => d.id !== id), result]);
    return result;
  }
  return (await api.put<VacancyDraft>(`/vacancy-drafts/${id}`, { version, data: draftInput(data) })).data;
}

export async function deleteDraft(id: string, version: number): Promise<void> {
  if (!USE_BACKEND) {
    const rows = demoRows();
    const d = rows.find(d => d.id === id && !d.deleted && !d.published);
    if (!d) fail(404, "Черновик не найден");
    if (d.version !== version) fail(409, "Черновик уже изменён. Обновите список.");
    demoWrite(rows.filter(d => d.id !== id));
    return;
  }
  await api.delete(`/vacancy-drafts/${id}`, { params: { version } });
}

export async function publishDraft(id: string, version: number): Promise<Vacancy> {
  if (!USE_BACKEND) {
    const rows = demoRows();
    const d = rows.find(d => d.id === id && !d.deleted);
    if (!d) fail(404, "Черновик не найден");
    if (d.published) return d.published;
    if (d.version !== version) fail(409, "Черновик изменён. Откройте свежую версию.");
    const data = draftInput(d.data);
    if (!data.date || data.start_time === null || data.end_time === null || data.rate === null || !data.city.trim()) fail(422, "Заполните дату, время, город и ставку");
    const published = await createDemoVacancy({ ...data, date: data.date!, start_time: data.start_time!, end_time: data.end_time!, rate: data.rate! });
    demoWrite(rows.map(row => row.id === id ? { ...row, published } : row));
    return published;
  }
  return (await api.post<Vacancy>(`/vacancy-drafts/${id}/publish`, { version })).data;
}
