import { setAuthCookies } from "@/lib/auth/cookies";
import { authResponse } from "@/lib/auth/http";
import { loadSessionProfile } from "@/lib/auth/profile";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const outcome = await loadSessionProfile(request);
  if (!outcome.ok) return outcome.response;

  const response = authResponse("00000", "操作成功", outcome.profile);
  if (outcome.rotated) setAuthCookies(response, outcome.rotated);
  return response;
}
