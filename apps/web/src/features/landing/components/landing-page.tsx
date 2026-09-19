import { AnynoteLogo } from "@/components/layout/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import {
  AvatarStack,
  CountCell,
  HeatRow,
  IconTile,
  MiniProgress,
  PlayerMock,
  SkeletonBar,
  SparkIcon,
} from "@/features/landing/components/landing-marks";
import {
  AI,
  BENTO_COUNTS,
  CTA,
  FEATURES,
  FOOTER,
  FOOTER_COLUMNS,
  HERO,
  NAV_LINKS,
} from "@/features/landing/lib/content";
import { cn } from "@/lib/utils";
import { FileInput, FileText, Layers3, Play, SquareCheckBig, Users } from "lucide-react";
import Link from "next/link";

/**
 * 官网首页（D-19 桌面 1440 / M-14 移动 390）。
 *
 * ## 为什么是一张 RSC
 *
 * 这一页对**未登录访客**公开，内容全是静态文案与示意图，没有一处需要客户端状态
 * （主题由 `next-themes` 在 `<html>` 上换类名，颜色全部走语义 Token）。
 * 所以整页保持 Server Component：零客户端 JS，落地页的首屏体积只算文档本身。
 *
 * ## 版式口径
 *
 * 下面每个数字都对着画板量过（`scripts/.live-audit/verify-landing.mjs` 可复现），
 * 不是"看起来差不多"。三条贯穿全页的规律：
 *
 * 1. **移动端不是桌面的缩放**。它是另一套字阶（H1 32/39 而非 56/62、正文 15 而非 19、
 *    区块标题 26/35 而非 34/41）与另一套栅格（Bento 单列、计数两列、CTA 全宽纵向）。
 *    所以断点两边**各写一套值**，而不是给桌面值加个 `md:` 缩小系数。
 * 2. **两块恒色区块**（AI 专区纯黑、结尾转化区品牌蓝渐变）不随主题翻转：
 *    画板深浅两版这两块逐像素相同，所以它们用 `ink-*` / `landing-*` 这类
 *    与主题无关的 Token，而不是 `bg-surface`。
 * 3. **Bento 两行的行距（44）大于列距（20）**，所以是**两个 grid** 而不是一个——
 *    一个 grid 只能给一套 gap，硬塞会把列距也撑成 44。
 */

/** 内容容器：1200 正文 + 两侧 20 内边距（1440 视口下正文 120..1320）。 */
function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5", className)}>{children}</div>;
}

/** 顶部导航。移动端收起中间锚点链接，只留 logo 与「免费开始」（画板 M-14）。 */
function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-separator bg-landing-surface/85 backdrop-blur-xl">
      <Container className="flex h-14 items-center justify-between md:h-16">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Anynote 首页">
          {/* Logo 桌面 30 / 移动 26（画板两版实测）。字标已写出「Anynote」，
              两个 Logo 都不传 label，对读屏是装饰性的。 */}
          <AnynoteLogo size={26} className="md:hidden" />
          <AnynoteLogo size={30} className="hidden md:block" />
          <span className="text-[15px] font-semibold tracking-tight text-label md:text-[17px]">
            Anynote
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="站内导航">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[16px] leading-6 text-label transition-colors hover:text-landing-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="hidden text-[16px] leading-6 text-label transition-colors hover:text-landing-accent md:block"
          >
            登录
          </Link>
          {/*
           * 五处「按钮」全部渲染成 `<a>`（`buttonVariants` + `<Link>`）而不是
           * Base UI 的 `Button` + `render`：后者无论 `nativeButton` 取值都会
           * 强制 `role="button"`，把链接语义盖掉——落地页这几处全是导航
           * （去注册、去登录、去文档），丢掉"这是链接"会让新窗口打开、右键复制
           * 地址、读屏的"链接"播报一起消失。这条与 `shared/states.tsx` 同源。
           */}
          <Link
            href={HERO.primaryCta.href}
            className={buttonVariants({
              className:
                "h-[31px] rounded-full bg-landing-accent px-4 text-[14px] font-medium text-white hover:bg-landing-accent/90 md:h-9 md:px-[18px] md:text-body",
            })}
          >
            免费开始
          </Link>
        </div>
      </Container>
    </header>
  );
}

/** 首屏：徽标 + 主标题 + 副文 + 双 CTA + 信任行 + 主视觉。 */
function Hero() {
  return (
    <section className="bg-landing-surface pt-14 pb-10 md:pt-[88px] md:pb-20">
      <Container className="flex flex-col items-center text-center">
        <span className="rounded-full bg-landing-accent-tint px-3.5 py-1.5 text-footnote font-medium text-landing-badge-ink">
          {HERO.badge}
        </span>

        {/*
         * 主标题：移动 32/39、桌面 56/62。
         * 字距**不要再加 `tracking-*`**——`globals.css` 的 base 层已给 h1 设了
         * `-0.01em`，画板实测桌面 55.5 的字距正是 `56 × 0.99`。再叠一层会让整行
         * 窄 8px，标题与画板不再同宽。
         *
         * 移动端宽度上限 320：画板上它就在「安静的地方」后断行（两行）。
         */}
        <h1 className="mt-7 max-w-[320px] text-[32px] leading-[39px] font-semibold text-label md:max-w-[900px] md:text-[56px] md:leading-[62px]">
          {HERO.title}
        </h1>

        {/* 副文在移动端**短一截**（画板 M-14 就去掉了「少一处切换…」那半句）：
            两句话挤在 390 宽里会折成三行，把 CTA 推出首屏。
            320 是画板的断行点（21 个字一行），330 会多挤进一个字。
            桌面 660 同理，是画板实测的换行点。 */}
        <p className="mt-4 max-w-[320px] text-[15px] leading-[22px] text-label-secondary md:mt-5 md:max-w-[660px] md:text-[19px] md:leading-[30px]">
          <span className="md:hidden">{HERO.subtitleMobile}</span>
          <span className="hidden md:inline">{HERO.subtitle}</span>
        </p>

        <div className="mt-7 flex w-full flex-col gap-2.5 md:w-auto md:flex-row md:gap-3.5">
          <Link
            href={HERO.primaryCta.href}
            className={buttonVariants({
              className:
                "h-12 w-full rounded-full bg-landing-accent px-8 text-[15px] font-medium text-white hover:bg-landing-accent/90 md:h-[49px] md:w-auto",
            })}
          >
            {HERO.primaryCta.label}
          </Link>
          <Link
            href={HERO.secondaryCta.href}
            className={buttonVariants({
              className:
                "h-12 w-full rounded-full bg-fill-hover px-8 text-[15px] font-medium text-label hover:bg-fill-hover/70 md:h-[49px] md:w-auto",
            })}
          >
            {HERO.secondaryCta.label}
          </Link>
        </div>

        <p className="mt-6 text-footnote leading-[18px] text-label-tertiary md:mt-7">
          {HERO.trust}
        </p>
      </Container>

      {/*
       * 主视觉：画板上是一张「安静的工作台」场景图，浅深两版各一张。
       *
       * 用 `background-image` + 一个随主题切换的 CSS 变量，而不是两个 `<img>` 切显隐：
       * `display:none` 的 `<img>` 浏览器照样会把 `src` 下载下来（两张全发），
       * 而 `display:none` 元素上的 `background-image` 是**不会**被请求的。
       * 结果是一次只下载当前主题那一张（各约 90–120KB）。
       *
       * 移动端比例 350/240（画板实测 350×240）——不是把桌面那张等比缩小：
       * 画板上移动版裁的是更扁的一段。
       */}
      <Container className="pt-10 md:pt-[52px]">
        <div
          data-testid="landing-hero-image"
          role="img"
          aria-label="一张安静的工作台：笔记本电脑、摊开的本子与一杯咖啡"
          style={{ backgroundImage: "var(--landing-hero)" }}
          className="aspect-[350/240] w-full rounded-[14px] bg-cover bg-center md:aspect-[1200/700] md:rounded-[20px]"
        />
      </Container>
    </section>
  );
}

/**
 * Bento 卡外壳。
 *
 * `min-h` 由调用方给，且**两态各是一套设计值**：桌面第 1 行 300 / 第 2 行 320，
 * 移动五张卡 395 / 256 / 296 / 259 / 265（画板逐张实测）。这些不是"内容自然撑开
 * 的结果"——画板上每张卡的留白都是量出来的，靠内容撑会对不上。
 */
function BentoCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <article
      data-slot="landing-card"
      className={cn(
        "flex flex-col rounded-[20px] bg-landing-card px-6 py-6 shadow-card md:px-7 md:py-7",
        className,
      )}
    >
      {children}
    </article>
  );
}

function BentoHeading({ title, body }: { title: string; body: string }) {
  return (
    <>
      {/* 图标块 → 标题、标题 → 正文：移动 11 / 12，桌面 13.5 / 13（画板两版实测） */}
      <h3 className="mt-[11px] text-[20px] leading-[26px] font-semibold text-label md:mt-[13px] md:text-[22px] md:leading-[28px]">
        {title}
      </h3>
      <p className="mt-[12px] text-[14px] leading-[21px] text-label-secondary md:mt-[13px] md:text-body">
        {body}
      </p>
    </>
  );
}

/** 核心功能区：一行说明 + Bento 五卡（桌面 2+3 两行，移动单列）。 */
function Features() {
  return (
    <section id="features" className="bg-grouped py-[67px] md:py-24">
      <Container>
        <div className="text-center">
          {/* 区块标题：移动 26/35、桌面 34/41。移动端 13 个字正好占满 338
              （画板实测墨宽 336.5），用 28 会折成两行 */}
          <h2 className="text-[26px] leading-[35px] font-semibold text-label md:text-[34px] md:leading-[41px]">
            {FEATURES.title}
          </h2>
          <p className="mt-[18px] text-[15px] leading-[22px] text-label-secondary md:text-[17px] md:leading-[22px]">
            <span className="md:hidden">{FEATURES.subtitleMobile}</span>
            <span className="hidden md:inline">{FEATURES.subtitle}</span>
          </p>
        </div>

        {/* 第 1 行：桌面 2 列（787 / 387）。移动端单列，卡间距 38（画板实测） */}
        <div className="mt-10 grid gap-[38px] md:mt-[46px] md:grid-cols-3 md:gap-5">
          <BentoCard className="min-h-[395px] md:col-span-2 md:min-h-[300px]">
            <IconTile className="bg-indigo">
              <Layers3 className="size-5" aria-hidden="true" />
            </IconTile>
            <BentoHeading
              title="知识库"
              body="以库为单位组织一切——笔记、课程、任务、资料与成员，各归其位，权限分明。"
            />
            {/* 计数格：桌面一行 5 格（间距 10）、移动两列（间距 8）。
                画板上这是两种栅格，不是缩放。 */}
            <div className="mt-6 grid grid-cols-2 gap-2 md:mt-[30px] md:grid-cols-5 md:gap-2.5">
              {BENTO_COUNTS.map((count) => (
                <CountCell key={count.label} {...count} />
              ))}
            </div>
          </BentoCard>

          <BentoCard className="min-h-[256px] md:min-h-[300px]">
            <IconTile className="bg-landing-accent">
              <FileText className="size-5" aria-hidden="true" />
            </IconTile>
            <BentoHeading
              title="笔记"
              body="全幅纸面　Markdown 友好，历史版本可回溯。写，就对了。"
            />
            {/* 四根示意条：首根更深更厚，逐根变短，读起来才像"几行字"而不是色块。
                移动端只有一根（画板 M-14 上这张卡就画了一根短条）。 */}
            <div className="mt-6 space-y-2.5 md:mt-[29px]">
              <SkeletonBar width="76%" tall strong className="md:hidden" />
              <SkeletonBar width="39%" tall strong className="hidden md:block" />
              <SkeletonBar width="100%" className="hidden md:block" />
              <SkeletonBar width="68%" className="hidden md:block" />
              <SkeletonBar width="51%" className="hidden md:block" />
            </div>
          </BentoCard>
        </div>

        {/* 第 2 行：桌面 3 等列，**独立的一个 grid**——行距 44 与列距 20 不同。
            移动端五张卡连成一列，卡间距统一 38。 */}
        <div className="mt-[38px] grid gap-[38px] md:mt-11 md:grid-cols-3 md:gap-5">
          <BentoCard className="min-h-[296px] md:min-h-[320px]">
            <IconTile className="bg-success">
              <Play className="size-5" aria-hidden="true" />
            </IconTile>
            <BentoHeading title="慕课" body="章节化课程挂在知识库下，目录与内容同屏，边看边记。" />
            <div className="mt-6 md:mt-[29px]">
              <PlayerMock />
            </div>
          </BentoCard>

          <BentoCard className="min-h-[259px] md:min-h-[320px]">
            <IconTile className="bg-warning">
              <SquareCheckBig className="size-5" aria-hidden="true" />
            </IconTile>
            <BentoHeading
              title="任务"
              body="布置、提交、退回、重交，闭环清晰。谁认真改，热力图看得见。"
            />
            <div className="mt-6 md:mt-[33px]">
              <HeatRow />
              <p className="mt-2.5 text-footnote leading-[18px] text-label-secondary">
                本周编辑热力 · 8 / 12 已提交
              </p>
              <div className="mt-[11px] md:mt-2.5">
                <MiniProgress percent={62} tone="bg-warning" />
              </div>
            </div>
          </BentoCard>

          <BentoCard className="min-h-[265px] md:min-h-[320px]">
            <IconTile className="bg-organization">
              <Users className="size-5" aria-hidden="true" />
            </IconTile>
            <BentoHeading title="协同文档" body="多人实时共写，光标与改动即时可见，无需刷新。" />
            <div className="mt-6 md:mt-[36px]">
              <div className="flex items-center gap-3">
                <AvatarStack colors={["bg-landing-accent", "bg-success", "bg-organization"]} />
                <span className="text-footnote leading-[18px] text-label-secondary">
                  3 人正在编辑
                </span>
              </div>
              {/* 移动端两根条更靠下（画板 2480 起，头像行底 2451 + 29） */}
              <div className="mt-[29px] space-y-2.5 md:mt-5">
                <SkeletonBar width="100%" />
                <SkeletonBar width="56%" />
              </div>
            </div>
          </BentoCard>
        </div>
      </Container>
    </section>
  );
}

/**
 * AI 卡：黑底上的一层 `#1C1C1E`。
 *
 * 内边距桌面 32 / 移动 24（画板实测）；桌面最小高 340，移动按内容定高 309。
 */
function AiCard({ children }: { children: React.ReactNode }) {
  return (
    <article
      data-slot="landing-ai-card"
      className="flex min-h-[309px] flex-col rounded-[20px] bg-ink-card px-6 py-6 md:min-h-0 md:px-8 md:py-8"
    >
      {children}
    </article>
  );
}

/** AI 专区：深底 + 两卡（AI 问答 / PDF 问答）。整块恒为纯黑，不随主题翻。 */
function AiSection() {
  const [chat, pdf] = AI.cards;
  return (
    <section id="ai" className="bg-ink pt-[64px] pb-16 md:py-24">
      <Container>
        <div className="text-center">
          <span className="inline-block rounded-full bg-ink-card px-3.5 py-1.5 text-footnote font-medium text-ink-accent">
            {AI.badge}
          </span>
          <h2 className="mt-4 text-[26px] leading-[35px] font-semibold text-on-ink md:text-[34px] md:leading-[41px]">
            {AI.title}
          </h2>
          <p className="mt-4 text-[15px] leading-[22px] text-on-ink-secondary md:mt-[17px] md:text-[17px]">
            {AI.subtitle}
          </p>
        </div>

        <div className="mt-10 grid gap-[38px] md:mt-[46px] md:min-h-[340px] md:grid-cols-2 md:gap-5">
          <AiCard>
            <IconTile className="bg-ink-accent">
              <SparkIcon className="size-5" />
            </IconTile>
            <h3 className="mt-[11px] text-[20px] leading-[26px] font-semibold text-on-ink md:mt-[13px] md:text-[22px] md:leading-[28px]">
              {chat.title}
            </h3>
            <p className="mt-[12px] text-[14px] leading-[21px] text-on-ink-secondary md:mt-[15px] md:text-body">
              {chat.body}
            </p>

            <div className="mt-[36px] space-y-2.5 md:mt-[32px]">
              <p className="w-fit rounded-[10px] bg-ink-elevated px-3.5 py-2 text-footnote text-on-ink">
                {chat.question}
              </p>
              <div className="rounded-[10px] bg-ink-answer px-3.5 py-2.5">
                <p className="text-footnote text-on-ink">{chat.answer}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-footnote text-on-ink-secondary">
                  <FileInput className="size-3.5" aria-hidden="true" />
                  {chat.source}
                </p>
              </div>
            </div>
          </AiCard>

          <AiCard>
            <IconTile className="bg-indigo">
              <FileText className="size-5" aria-hidden="true" />
            </IconTile>
            <h3 className="mt-[11px] text-[20px] leading-[26px] font-semibold text-on-ink md:mt-[13px] md:text-[22px] md:leading-[28px]">
              {pdf.title}
            </h3>
            <p className="mt-[12px] text-[14px] leading-[21px] text-on-ink-secondary md:mt-[15px] md:text-body">
              {pdf.body}
            </p>

            <div className="mt-[47px] space-y-2.5 md:mt-[32px]">
              <div className="flex items-center gap-3 rounded-[10px] bg-ink-elevated px-3.5 py-2">
                <FileText className="size-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-footnote text-on-ink">{pdf.fileName}</span>
                  <span className="block text-[11px] leading-4 text-success">{pdf.fileMeta}</span>
                </span>
              </div>
              <p className="w-fit rounded-[10px] bg-ink-elevated px-3.5 py-2 text-footnote text-on-ink">
                {pdf.question}
              </p>
            </div>
          </AiCard>
        </div>
      </Container>
    </section>
  );
}

/**
 * 结尾转化区：品牌蓝渐变底。
 *
 * 渐变用 `bg-linear-to-br`（Tailwind v4 的对角渐变）+ 两端 Token。
 * 画板实测左上 `#2191EC` → 右下 `#59C7FA`，两条对角线的取样一致，
 * 说明它就是一条 135° 的线性渐变，不是径向或多段叠加。
 *
 * 白底按钮上的文字用 `--landing-on-white`：它深浅两态**都是** `#0071E3`（实测），
 * 不跟着 `--landing-accent` 在深色下翻成 `#0A84FF`。
 */
function CtaSection() {
  return (
    <section className="bg-linear-to-br from-[var(--landing-cta-from)] to-[var(--landing-cta-to)] pt-[46px] pb-12 md:pt-[88px] md:pb-24">
      <Container className="flex flex-col items-center text-center">
        <h2 className="text-[26px] leading-[35px] font-semibold text-white md:text-[34px] md:leading-[41px]">
          {CTA.title}
        </h2>
        <p className="mt-4 text-[15px] leading-[22px] text-white/90 md:mt-[25px] md:text-[17px]">
          {CTA.subtitle}
        </p>

        <div className="mt-9 flex w-full flex-col gap-3 md:mt-[27px] md:w-auto md:flex-row md:gap-3.5">
          <Link
            href={CTA.primary.href}
            className={buttonVariants({
              className:
                "h-11 w-full rounded-full bg-white px-8 text-[15px] font-medium text-landing-on-white hover:bg-white/90 md:h-[49px] md:w-auto",
            })}
          >
            {CTA.primary.label}
          </Link>
          {/* 次按钮是描边式：画板上它是 1.5px 白描边 + 透明底，字为白色 */}
          <Link
            href={CTA.secondary.href}
            className={buttonVariants({
              className:
                "h-11 w-full rounded-full border-[1.5px] border-white bg-transparent px-8 text-[15px] font-medium text-white hover:bg-white/10 md:h-[49px] md:w-auto",
            })}
          >
            {CTA.secondary.label}
          </Link>
        </div>
      </Container>
    </section>
  );
}

/** 页脚：品牌块 + 三列链接 + 分隔线 + 版权行。 */
function LandingFooter() {
  return (
    <footer className="bg-landing-surface pt-12 md:pt-16">
      <Container>
        {/* 品牌块 + 三列。桌面三列间距 72 并整体靠右（画板实测起点 650 / 954 / 1269） */}
        <div className="flex flex-col gap-9 md:flex-row md:items-start md:justify-between md:gap-0">
          {/* 桌面品牌块最宽 276（画板正文 x 120..392），再宽半句就挤到第二行 */}
          <div className="md:max-w-[276px]">
            <div className="flex items-center gap-2.5">
              <AnynoteLogo size={26} className="md:hidden" />
              <AnynoteLogo size={30} className="hidden md:block" />
              <span className="text-[17px] leading-[22px] font-semibold text-label">Anynote</span>
            </div>
            <p className="mt-[13px] text-footnote leading-[18px] text-label-secondary">
              <span className="md:hidden">{FOOTER.taglineMobile}</span>
              <span className="hidden md:inline">{FOOTER.tagline}</span>
            </p>
          </div>

          {/* 移动端三列等宽平铺（画板 M-14）；桌面三列各自只占内容宽 */}
          <div className="grid grid-cols-3 gap-4 md:flex md:gap-[72px]">
            {FOOTER_COLUMNS.map((column) => {
              const mobileLabels = new Set(column.mobileLinks.map((link) => link.label));
              return (
                <nav key={column.title} aria-label={column.title}>
                  <h3 className="text-footnote font-semibold text-label">{column.title}</h3>
                  {/* 列头 → 首链接 13、链接之间 11（画板实测 3416→3449→3484→3519） */}
                  <ul className="mt-[13px] space-y-[11px]">
                    {/*
                     * 移动端每列少的那一项**位置不固定**（产品列去末项「更新日志」、
                     * 关于列去中间的「联系方式」），所以显隐按 `mobileLinks` 里有没有
                     * 这个名字来判，不能写成 `index >= 3`——那样「关于」列在手机上会
                     * 变成「关于我们 / 联系方式 / 隐私政策」，与画板对不上。
                     */}
                    {column.links.map((link) => (
                      <li
                        key={link.label}
                        className={cn(!mobileLabels.has(link.label) && "hidden md:block")}
                      >
                        <Link
                          href={link.href}
                          className="text-footnote leading-[18px] text-label-secondary transition-colors hover:text-label"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>
        </div>
      </Container>

      {/* 分隔线是**通栏**的（画板实测 120..1320），所以它铺满内容宽而不是某一列 */}
      <Container>
        <div className="mt-10 flex flex-col gap-4 border-t border-separator pt-[37px] pb-[42px] text-footnote leading-[18px] text-label-tertiary md:flex-row md:items-center md:justify-between">
          <p>{FOOTER.copyright}</p>
          <p>{FOOTER.locale}</p>
        </div>
      </Container>
    </footer>
  );
}

export function LandingPage() {
  return (
    <main data-testid="landing-page" className="min-h-screen bg-landing-surface">
      <LandingNav />
      <Hero />
      <Features />
      <AiSection />
      <CtaSection />
      <LandingFooter />
    </main>
  );
}
