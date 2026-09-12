import { redirect } from "next/navigation";

export default function Page() {
  // 移动端的设置入口是「我的」，直接访问 /m/settings 落到分组列表
  redirect("/m/me");
}
