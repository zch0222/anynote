import type { MeProfile } from "@/features/auth/schemas";

export function isSystemAdmin(profile: MeProfile | null | undefined): boolean {
	return profile?.role?.roleKey === "ADMIN_X";
}
