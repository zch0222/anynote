import { redirect } from "next/navigation";

/** 旧地址 `/m/mooc` → `/m/notes`（F-02 规则 R，理由同 `/m/tasks`）。 */
export default function Page() {
  redirect("/m/notes");
}
