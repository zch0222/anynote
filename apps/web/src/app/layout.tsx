import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anynote",
  description: "记录、整理你的想法",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes 会在挂载时改写 <html> 的 class，需要抑制 SSR 水合告警
    //
    // 字体变量类名必须挂在 <html> 而不是 <body>：`globals.css` 的 base 层在
    // `html` 上求值 `font-family: var(--font-geist-sans), …`，而 `next/font` 生成的
    // `--font-geist-sans` 只定义在挂类名的那个元素上。挂在 <body> 时 `<html>` 上
    // 这个变量是空的，`var()` 解析失败会让**整条 `font-family` 声明失效**
    // （invalid at computed-value time，不报错也不回退），全站退回浏览器默认字体。
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
