import { api } from "./client";
import { fetchOutgoingInvitations as demoInvitations } from "./mock";
import type { StaffRole } from "@/types/domain";

export type InvitationView = "all" | "waiting" | "with_matches";
export interface OutgoingInvitation {
  id: string;
  userId: string;
  name: string;
  photoUrl: string;
  roles: StaffRole[];
  invitedAt: string;
  status: string;
  matchesCount: number;
  latestMatch: { id: string; status: string; role: StaffRole; shiftDate: string; shiftStart: number; shiftEnd: number } | null;
}
export interface InvitationPage {
  items: OutgoingInvitation[];
  total: number;
  nextOffset: number | null;
}

export async function fetchOutgoingInvitations(view: InvitationView, offset = 0): Promise<InvitationPage> {
  if (import.meta.env.VITE_USE_BACKEND !== "true") return demoInvitations(view, offset);
  return (await api.get<InvitationPage>("/employer/invitations", { params: { view, offset } })).data;
}
