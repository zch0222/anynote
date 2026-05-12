# Anynote 全栈重构技术方案

> 文档版本：v1.0 | 生成日期：2026-05-02  
> 执行对象：Claude Code  
> 工作目录：项目根（本仓库根目录）

---

## 一、现状诊断摘要

### 关键缺陷清单

| 等级 | 问题 | 位置 |
|------|------|------|
| 🔴 CRITICAL | Spring Boot 2.7.7 EOL（2023.05 停支持） | `Anynote-Cloud/pom.xml:29` |
| 🔴 CRITICAL | Spring Cloud 2021.0.5 EOL（2024.12 停支持） | `Anynote-Cloud/pom.xml:30` |
| 🔴 CRITICAL | Java 1.8 EOL，缺少 JVM 新特性支持 | `Anynote-Cloud/pom.xml:39` |
| 🟠 HIGH | JWT Token 存 JS Cookie，XSS 可读 | `src/store/user/userSlice.ts:14` |
| 🟠 HIGH | Token 刷新有竞争条件（并发 401） | `src/utils/client-request.ts:38-95` |
| 🟠 HIGH | 文件模块循环依赖 AI/Note 模块 | `anynote-modules-file/pom.xml:58,64` |
| 🟠 HIGH | 无任何 OpenAPI 规范合约，前后端类型手动维护 | 全项目 |
| 🟠 HIGH | 鉴权仅在 Gateway，服务内部无隔离 | `AuthFilter.java:45-160` |
| 🟡 MEDIUM | POI 版本冲突（4.1.2 vs 5.2.3） | `pom.xml:42,54` |
| 🟡 MEDIUM | Swagger 注解混用（1.6 vs 2.0），多控制器无文档 | 多处 |
| 🟡 MEDIUM | NoteController 存在 `return null` 未实现端点 | `NoteController.java:88-89` |
| 🟡 MEDIUM | 前端无统一 API 层抽象，请求散落组件 | `src/requests/client/` |

---

## 二、目标架构

### 2.1 Monorepo 结构（目标）

```
anynote/                          ← Git 根目录（polyglot monorepo）
├── pnpm-workspace.yaml           ← pnpm workspaces
├── package.json                  ← 根级脚本与工具链
├── turbo.json                    ← Turborepo 任务编排
├── biome.json                    ← 统一 JS/TS lint + format
├── .env.example                  ← 全局环境变量模板
│
├── apps/
│   ├── web/                      ← Next.js 15 前端（完全重写）
│   └── desktop/                  ← Tauri 桌面包装（保留）
│
├── packages/
│   ├── api-client/               ← 自动生成的 TypeScript API 客户端
│   ├── ui/                       ← 共享 UI 组件库（shadcn/ui based）
│   └── tsconfig/                 ← 共享 TypeScript 配置
│
├── services/
│   ├── gateway/                  ← Spring Cloud Gateway（重构）
│   ├── auth/                     ← 认证服务（重构）
│   ├── system/                   ← 用户/权限/组织（重构）
│   ├── note/                     ← 笔记核心（重构）
│   ├── file/                     ← 文件存储（重构，解耦）
│   ├── ai/                       ← AI 统一服务（合并 ai + ai-nio）
│   ├── notify/                   ← 通知服务（重构）
│   └── bom/                      ← Maven BOM 统一版本管理
│
├── ai-service/                   ← Python FastAPI（重构）
│
├── openapi/                      ← OpenAPI 规范中心
│   ├── specs/                    ← 各服务 YAML 聚合
│   └── generate.sh               ← 生成前端 API 客户端脚本
│
├── infra/
│   ├── docker/                   ← Docker Compose（中间件 + 服务）
│   ├── nacos/configs/            ← Nacos 配置
│   └── sql/                      ← 数据库 schema
│
└── .claude/
    └── openspec/                 ← OpenSpec 变更记录（vibe coding 用）
```

### 2.2 技术栈目标

| 层 | 当前 | 目标 |
|----|------|------|
| Java | 1.8 | **21 LTS** |
| Spring Boot | 2.7.7 | **3.3.x** |
| Spring Cloud | 2021.0.5 | **2023.0.x** |
| Maven | 无 BOM 统一 | **BOM 模块 + Enforcer** |
| API 文档 | Springfox 3（混用） | **Springdoc OpenAPI 3** |
| 前端框架 | Next.js 13.5 | **Next.js 15 (App Router)** |
| 前端状态 | Redux Toolkit | **Zustand（客户端）+ TanStack Query（服务端）** |
| 前端 UI | NextUI + Ant Design（双库） | **shadcn/ui + Tailwind CSS** |
| 前端 API | 手写 + 手动类型 | **openapi-typescript 自动生成** |
| 前端认证 | JS Cookie 存 Token | **httpOnly Cookie（服务端 BFF）** |
| Python | FastAPI（无规范） | **FastAPI 0.115+ Pydantic v2** |
| 代码规范 | ESLint（Next 默认） | **Biome（lint + format）** |

---

## 三、技术选型决策依据

> 本章说明目标架构中每个关键技术选择的具体原因，以及为什么不选其他方案。

---

### 3.1 后端：为什么选 Spring Boot 3.3.x 而非 3.2 或 3.4？

**选 Spring Boot 3.x 系列的根本原因**

Spring Boot 2.7.7 已于 2023 年 5 月停止安全更新，继续使用意味着已知 CVE 漏洞不会有官方补丁。Spring Boot 3.x 强制升级到 Jakarta EE 10（`javax.*` → `jakarta.*`），这是一次不可跳过的破坏性迁移，早做早得，晚做代价更高。

**选 3.3.x 不选 3.2.x**

| 版本 | 状态 | 关键特性 |
|------|------|---------|
| 3.1.x | EOL（2024.11） | 不选 |
| 3.2.x | 维护期（至 2025.02） | 窗口期短 |
| **3.3.x** | **当前主力（至 2025.08）** | **Virtual Threads 正式 GA** |
| 3.4.x | 最新，仅发布 6 个月 | 尚不够稳定 |

3.3.x 的核心理由是 **Project Loom 虚拟线程（Virtual Threads）正式生产可用**。当前 ai-nio 模块已经使用 Project Reactor 处理异步 IO，这在 Spring Boot 2.x 时代是必要的。升级到 3.3 后，同样的高并发 IO 场景可以用更简单的阻塞式代码 + 虚拟线程实现，大幅降低代码复杂度，同时保持吞吐量。

**对应 Spring Cloud 版本锁定**

Spring Boot 与 Spring Cloud 版本有严格的兼容矩阵：
- Spring Boot 3.3.x → Spring Cloud **2023.0.x**（代号 Leyton）
- Spring Cloud Alibaba 对应 **2023.0.1.0**（支持 Nacos 2.3+）

这是官方支持的唯一组合，不能跨版本混用。

---

### 3.2 后端：为什么升级到 JDK 21 而非 17？

JDK 17 是 2021 年的 LTS，JDK 21 是 2023 年的 LTS，两者都是有效选择。选 21 的理由：

**语言特性**

| 特性 | JDK 17 | JDK 21 |
|------|--------|--------|
| Record | ✅ | ✅ |
| Sealed Classes | ✅ | ✅ |
| Pattern Matching (instanceof) | ✅ | ✅ |
| **Virtual Threads** | ❌ Preview | ✅ **GA** |
| **Pattern Matching (switch)** | ❌ Preview | ✅ **GA** |
| **Record Patterns** | ❌ | ✅ **GA** |
| **Sequenced Collections** | ❌ | ✅ |

Virtual Threads 在 JDK 21 才正式 GA，这是与 Spring Boot 3.3 配合发挥最大价值的关键特性。项目既然要升级 Spring Boot 3.3，JDK 21 是最自然的配套。

**生命周期**：JDK 21 免费支持到 2028 年，JDK 17 到 2026 年。选 21 多争取两年窗口期。

---

### 3.3 前端：为什么选 Next.js 15 而非保留 13？

**保留 Next.js 13 的问题**

当前项目使用 Next.js 13.5.6（App Router 的第一个稳定版）。App Router 在 13.x 时期仍有大量已知 bug 和不稳定 API，Vercel 在 14、15 中做了大量修复：

| 版本 | 状态 | 核心问题 |
|------|------|---------|
| 13.5.x | EOL | `use cache` 不稳定，hydration 问题多 |
| 14.x | 维护期 | Turbopack 仍是实验性 |
| **15.x** | **当前稳定** | **React 19 + 稳定的 Partial Prerendering** |

**Next.js 15 的关键改进（与 13 相比）**

1. **React 19 支持**：`use()` Hook、Server Actions 稳定、Suspense 改进
2. **`<Form>` 组件**：内置与 Server Actions 集成的表单，取代手写 `onSubmit`
3. **`after()` API**：在响应发送后执行后台任务（如日志、analytics），无需起新线程
4. **静态路由指示器**：开发时明确区分静态/动态路由，避免意外动态渲染
5. **Turbopack 正式 GA**：dev 模式构建速度提升 70%+
6. **`cacheLife` / `cacheTag` API**：细粒度缓存控制

**为什么是全量重写而非升级**

从 13 升级到 15 理论上可行，但当前前端代码存在结构性问题（Token 安全漏洞、无 API 层抽象、Redux 与 SWR 双重状态管理），逐步升级等于在破损地基上修房子。重写的额外收益远大于迁移成本。

---

### 3.4 前端状态管理：为什么用 Zustand + TanStack Query 替换 Redux Toolkit？

**现有 Redux 的核心问题**

当前项目用 Redux 管理了两类性质完全不同的状态：

```
Redux store 现状：
├── userSlice    → 认证状态（服务端数据）
├── messageSlice → 全局消息提示（UI 状态）
├── themeSlice   → 主题（UI 状态）
└── sideRouterSlice → 侧边栏路由（UI 状态）
```

服务端数据（用户信息、笔记列表等）和客户端 UI 状态（主题、侧边栏开关）被混在同一个 store 里，这导致：
- 服务端数据缺少缓存失效、后台刷新、乐观更新等能力
- 每次 API 调用都要手写 `pending/fulfilled/rejected` 三个 case
- 实际数据流：`useEffect fetch → dispatch → selector`，链路长且易出错

**TanStack Query 负责服务端状态**

TanStack Query（原 React Query）是专门为"服务端状态"设计的库，内置了 Redux 手写不到的能力：

| 能力 | Redux + 手写 | TanStack Query |
|------|------------|----------------|
| 请求去重 | 需手写 | ✅ 自动 |
| 后台静默刷新 | 需手写 | ✅ `staleTime` |
| 失败重试 | 需手写 | ✅ 指数退避 |
| 乐观更新 | 需手写 | ✅ `onMutate` |
| 无限滚动分页 | 复杂 | ✅ `useInfiniteQuery` |
| 缓存自动失效 | 需手写 | ✅ `invalidateQueries` |
| SSE / 实时数据 | 无内置支持 | ✅ `queryClient.setQueryData` |

**Zustand 负责客户端状态**

替换 Redux 管理客户端 UI 状态（主题、侧边栏开关、编辑器配置）：

```ts
// Redux 写法：需要 action、reducer、selector 三个文件
// Zustand 写法：一个文件 20 行
const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  theme: 'system',
  setTheme: (theme) => set({ theme }),
}));
```

Zustand 无 Provider 包裹、无样板代码、与 React 18 concurrent mode 完全兼容、包体积 1.1kb（Redux Toolkit 压缩后约 11kb）。

**为什么不选其他方案**

- **Jotai**：原子模型更适合细粒度状态，对本项目侧边栏/主题场景略显过度设计
- **Valtio**：Proxy 模型对 SSR 支持不成熟
- **Context API**：频繁更新会导致全树重渲染，不适合高频 UI 状态
- **保留 Redux**：可行但引入 RTK Query 的迁移成本与直接选 TanStack Query 相当，且 TanStack Query 生态更活跃

---

### 3.5 前端 UI：为什么从 NextUI + Ant Design 迁移到 shadcn/ui？

**当前问题：双 UI 库并存**

项目同时依赖 NextUI 2.x 和 Ant Design 5.x，这带来：
- **包体积**：两套组件库未经 tree-shaking 优化，初始 JS 体积大
- **主题系统冲突**：两套设计 Token（NextUI 的 CSS Variables vs AntD 的 Design Token），暗色模式实现路径不一致
- **样式隔离**：AntD 使用 CSS-in-JS（@ant-design/cssinjs），与 Tailwind 存在优先级竞争，当前靠 `AntdRegistry` 临时解决
- **版本锁定**：AntD 5.x 和 NextUI 2.x 都有 React 18 peer dependency，升级 React 19 需等待两个库同步跟进

**shadcn/ui 的定位**

shadcn/ui 不是传统的"组件库"，而是**组件源码模板**：通过 CLI 将组件代码直接复制到 `components/ui/` 目录，完全可修改，无运行时依赖。

| 维度 | Ant Design | NextUI | shadcn/ui |
|------|-----------|--------|-----------|
| 引入方式 | npm 包 | npm 包 | 源码复制（无包依赖） |
| 主题系统 | Design Token + CSS-in-JS | CSS Variables | CSS Variables（Tailwind） |
| 包体积影响 | 大（全量引入） | 中 | **零**（已在源码中） |
| 自定义程度 | 低（覆盖样式） | 中 | **完全可改** |
| Tailwind 兼容 | 冲突 | 部分兼容 | **原生** |
| React 19 支持 | 需等版本 | 需等版本 | **即时**（源码由你控制） |
| 暗色模式 | `theme={{ algorithm }}` | `className="dark"` | **`className="dark"`（统一）** |

**保留 Milkdown 编辑器**

shadcn/ui 替换的是通用 UI 组件（按钮、表单、对话框等）。Milkdown 是专业的 Markdown 编辑器，无对应替代品，保留并封装为独立的 `components/editors/` 组件。

**数据密集型场景的处理**

Ant Design 的 Table、DatePicker、Select 在复杂数据场景（如笔记列表的多列筛选）确实有优势。方案：对于确实需要的复杂组件，按需引入 AntD 单个组件（而非整个库），避免全量依赖。

---

## 四、分阶段执行计划

> **阅读说明**：每个阶段列出具体操作步骤，标注 `[CLAUDE CODE]` 的任务可直接交给 Claude Code 执行。  
> 阶段之间有依赖关系，**必须按顺序执行**。阶段内部分步骤可并行。

---

### Phase 0：Monorepo 基础设施（优先级 P0，耗时约 1 天）

**目标**：将三个独立目录整合为统一的 polyglot monorepo，建立工具链。

**前置条件**：无

#### 0.1 目录重组

```
[CLAUDE CODE] 执行以下操作：

1. 在项目根创建以下目录结构：
   - apps/web/（暂时空目录，Phase 5 填充）
   - packages/api-client/
   - packages/ui/
   - packages/tsconfig/
   - services/bom/
   - openapi/specs/
   - infra/

2. 将 Anynote-Cloud/ 下各 Maven 模块移动到 services/：
   - anynote-gateway → services/gateway
   - anynote-auth → services/auth
   - anynote-modules/anynote-modules-system → services/system
   - anynote-modules/anynote-modules-note → services/note
   - anynote-modules/anynote-modules-file → services/file
   - anynote-modules/anynote-modules-ai + anynote-modules-ai-nio → services/ai（合并）
   - anynote-modules/anynote-modules-notify → services/notify
   - anynote-modules/anynote-modules-job → services/job（暂不迁移，后期评估）
   - anynote-common/ → services/common/（或内联到 bom）
   - anynote-api/ → services/api/
   
3. 将 anynote-langchain/ 重命名为 ai-service/

4. 将 anynote-next-web-dev/ 内容迁移到 apps/web/（暂时保留原始文件，Phase 5 重写）

5. 将 docker-compose*.yaml 和 sql/ 移动到 infra/
```

#### 0.2 根级 package.json + pnpm workspaces

```
[CLAUDE CODE] 创建以下文件：

文件：`package.json`（项目根）
内容：
{
  "name": "anynote",
  "private": true,
  "packageManager": "pnpm@9.x",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "format": "biome format --write .",
    "openapi:generate": "bash openapi/generate.sh",
    "services:build": "cd services && mvn clean install -DskipTests"
  }
}

文件：`pnpm-workspace.yaml`（项目根）
内容：
packages:
  - "apps/*"
  - "packages/*"
```

#### 0.3 Turborepo 配置

```
[CLAUDE CODE] 创建 turbo.json：

{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": { "outputs": [] },
    "openapi:generate": {
      "dependsOn": [],
      "outputs": ["packages/api-client/src/**"]
    }
  }
}
```

#### 0.4 共享 TypeScript 配置

```
[CLAUDE CODE] 创建 packages/tsconfig/base.json：

{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

#### 0.5 Biome（lint + format）

```
[CLAUDE CODE] 安装并配置 Biome：

根目录执行：pnpm add -D -w @biomejs/biome

创建 biome.json：
{
  "$schema": "https://biomejs.dev/schemas/1.x/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

**验收标准**：`pnpm install` 成功，`ls apps/ packages/ services/ ai-service/ infra/ openapi/` 目录存在。

---

### Phase 1：OpenAPI Contract First（优先级 P0，耗时约 2 天）

**目标**：建立 API 合约作为前后端的唯一真相来源，驱动后续前端自动类型生成。

**前置条件**：Phase 0 完成

#### 1.1 后端替换 Springfox → Springdoc OpenAPI 3

```
[CLAUDE CODE] 修改 services/bom/pom.xml（新建 BOM 模块，见 Phase 3.1），
或暂时修改 Anynote-Cloud/pom.xml：

1. 删除以下依赖：
   - springfox-boot-starter（anynote-common-swagger 中）
   - swagger-annotations 1.6.2

2. 添加 Springdoc OpenAPI：
   <dependency>
     <groupId>org.springdoc</groupId>
     <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
     <version>2.3.0</version>
   </dependency>
   <!-- 对于 WebFlux 模块（ai-nio）使用：-->
   <dependency>
     <groupId>org.springdoc</groupId>
     <artifactId>springdoc-openapi-starter-webflux-ui</artifactId>
     <version>2.3.0</version>
   </dependency>

3. 在每个服务的 application.yml 添加：
   springdoc:
     api-docs:
       path: /v3/api-docs
     swagger-ui:
       path: /swagger-ui.html
     group-configs:
       - group: v1
         paths-to-match: /api/v1/**
```

#### 1.2 为所有控制器补充 OpenAPI 3 注解

```
[CLAUDE CODE] 按以下规范为控制器添加注解（以 NoteController 为例）：

将旧注解替换：
- @Api("xxx") → @Tag(name = "xxx")
- @ApiOperation("xxx") → @Operation(summary = "xxx")
- @ApiParam → @Parameter
- @ApiModel → @Schema
- @ApiModelProperty → @Schema(description = "xxx")

重点文件（按优先级）：
1. anynote-auth/TokenController.java
2. anynote-modules-note/NoteController.java
3. anynote-modules-system/SysUserController.java
4. anynote-modules-ai-nio/ChatController.java
5. anynote-modules-file/FileController.java

同时添加 API 版本前缀：将所有路由统一为 /api/v1/* 格式
```

#### 1.3 Gateway 聚合 OpenAPI

```
[CLAUDE CODE] 在 services/gateway 添加 OpenAPI 聚合配置：

application.yml 添加：
springdoc:
  swagger-ui:
    urls:
      - name: auth
        url: /auth/v3/api-docs
      - name: system
        url: /system/v3/api-docs
      - name: note
        url: /note/v3/api-docs
      - name: file
        url: /file/v3/api-docs
      - name: ai
        url: /ai/v3/api-docs
      - name: notify
        url: /notify/v3/api-docs

同时确保 Gateway 路由配置转发 /*/v3/api-docs 路径
```

#### 1.4 Python FastAPI OpenAPI 规范化

```
[CLAUDE CODE] 修改 ai-service/app.py：

from fastapi import FastAPI

app = FastAPI(
    title="Anynote AI Service",
    version="1.0.0",
    description="LLM/RAG 服务接口",
    openapi_url="/v3/api-docs",
    docs_url="/swagger-ui.html"
)

为所有端点添加 Pydantic v2 类型标注和 response_model：
- chat_controller.py 的每个路由
- rag_controller.py 的每个路由
- whisper_controller.py 的每个路由

确保 openapi_extra、summary、description 字段填写
```

#### 1.5 建立 API 客户端自动生成流程

```
[CLAUDE CODE] 创建 openapi/generate.sh：

#!/bin/bash
set -e

# 从运行中的 Gateway 拉取各服务 OpenAPI spec
services=("auth" "system" "note" "file" "ai" "notify")
for svc in "${services[@]}"; do
  curl -s http://localhost:8080/${svc}/v3/api-docs \
    > openapi/specs/${svc}.json
done

# 聚合并生成 TypeScript 客户端
pnpm dlx openapi-typescript openapi/specs/*.json \
  --output packages/api-client/src/

echo "✅ API client generated in packages/api-client/src/"

创建 packages/api-client/package.json：
{
  "name": "@anynote/api-client",
  "version": "0.0.1",
  "main": "src/index.ts",
  "scripts": {
    "generate": "bash ../../openapi/generate.sh"
  }
}
```

**验收标准**：
- `http://localhost:8080/swagger-ui.html` 显示聚合 API 文档
- `pnpm openapi:generate` 生成 `packages/api-client/src/*.ts`

---

### Phase 2：Maven BOM 重构与依赖治理（优先级 P1，耗时约 1 天）

**目标**：消灭版本冲突，建立统一版本管理，修复循环依赖。

**前置条件**：Phase 0 完成（目录迁移到 services/）

#### 2.1 创建 BOM 模块

```
[CLAUDE CODE] 创建 services/bom/pom.xml：

<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.anynote</groupId>
  <artifactId>anynote-bom</artifactId>
  <version>2.0.0-SNAPSHOT</version>
  <packaging>pom</packaging>
  <name>Anynote BOM</name>

  <properties>
    <java.version>21</java.version>
    <spring-boot.version>3.3.4</spring-boot.version>
    <spring-cloud.version>2023.0.3</spring-cloud.version>
    <spring-cloud-alibaba.version>2023.0.1.0</spring-cloud-alibaba.version>
    <mybatis-plus.version>3.5.7</mybatis-plus.version>
    <springdoc.version>2.3.0</springdoc.version>
    <elasticsearch.version>8.12.0</elasticsearch.version>
    <minio.version>8.5.12</minio.version>
    <rocketmq.version>5.1.4</rocketmq.version>
    <poi.version>5.2.5</poi.version>  <!-- 统一为最新版，删除 4.1.2 -->
    <druid.version>1.2.21</druid.version>
    <fastjson2.version>2.0.46</fastjson2.version>
  </properties>

  <dependencyManagement>
    <dependencies>
      <!-- Spring Boot BOM -->
      <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-dependencies</artifactId>
        <version>${spring-boot.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
      <!-- Spring Cloud BOM -->
      ...（列出所有受管理依赖）
    </dependencies>
  </dependencyManagement>
</project>

同时添加 Maven Enforcer 插件到根 pom，强制：
- 无重复依赖
- 统一 Java 版本
- 无 SNAPSHOT 版本在 release 构建中
```

#### 2.2 修复循环依赖与不合理耦合

```
[CLAUDE CODE] 修改 services/file/pom.xml：

问题：anynote-modules-file 依赖 anynote-api-ai 和 anynote-api-note
分析：文件服务不应依赖业务模块
操作：
1. 删除 anynote-api-ai 和 anynote-api-note 依赖
2. 识别为何依赖这两个模块（读取 FileController.java 相关代码）
3. 如果有 AI 文件处理逻辑，通过 RocketMQ 事件解耦，或将相关逻辑移至 note/ai 模块

修改 services/note/pom.xml 与 services/ai/pom.xml：
- 若存在相互依赖，改为通过 Feign + API 模块单向依赖
```

#### 2.3 统一版本号引用

```
[CLAUDE CODE] 扫描所有 services/*/pom.xml：

1. 删除所有模块中手动重复声明已在 BOM 中管理的版本号
2. 用 ${property.version} 替换硬编码版本字符串
3. 确保所有模块的 parent 指向根 pom 或 spring-boot-starter-parent

运行验证：mvn dependency:tree -pl services/note | grep -i conflict
```

**验收标准**：`mvn clean install -DskipTests` 在 services/ 根目录成功，`mvn enforcer:enforce` 无报错。

---

### Phase 3：Spring Boot 3 升级（优先级 P1，耗时约 3-4 天）

**目标**：将所有 Java 服务升级至 JDK 21 + Spring Boot 3.3 + Spring Cloud 2023。

**前置条件**：Phase 2 完成

> ⚠️ **重大破坏性变更**：Spring Boot 3 将 `javax.*` 包全部迁移至 `jakarta.*`，Spring Security 5 → 6 配置方式改变，MyBatis Plus 需升级至 3.5.7+。

#### 3.1 JDK 升级

```
[CLAUDE CODE] 修改 services/bom/pom.xml 及所有子模块：

<properties>
  <java.version>21</java.version>
  <maven.compiler.source>21</maven.compiler.source>
  <maven.compiler.target>21</maven.compiler.target>
</properties>

编译器插件添加：
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-compiler-plugin</artifactId>
  <version>3.13.0</version>
  <configuration>
    <release>21</release>
    <compilerArgs>
      <arg>--enable-preview</arg>
    </compilerArgs>
  </configuration>
</plugin>
```

#### 3.2 javax → jakarta 命名空间迁移

```
[CLAUDE CODE] 对 services/ 下所有 Java 源文件执行批量替换：

import javax.servlet.* → import jakarta.servlet.*
import javax.validation.* → import jakarta.validation.*
import javax.persistence.* → import jakarta.persistence.*
import javax.annotation.* → import jakarta.annotation.*
import javax.transaction.* → import jakarta.transaction.*

命令（需在每个 services/* 目录执行）：
find . -name "*.java" -exec sed -i 's/import javax\.servlet/import jakarta.servlet/g' {} +
find . -name "*.java" -exec sed -i 's/import javax\.validation/import jakarta.validation/g' {} +
find . -name "*.java" -exec sed -i 's/import javax\.annotation/import jakarta.annotation/g' {} +
find . -name "*.java" -exec sed -i 's/import javax\.persistence/import jakarta.persistence/g' {} +

注意：javax.sql.* 不需要替换（JDBC 保持 javax.sql）
```

#### 3.3 Spring Security 6 配置迁移

```
[CLAUDE CODE] 修改 services/gateway 中 SecurityConfig.java（当前几乎全注释掉）：

当前问题：Spring Security 5 的 WebSecurityConfigurerAdapter 在 Spring Boot 3 中已删除

新写法（SecurityConfig.java）：
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {
  
  @Bean
  public SecurityWebFilterChain securityFilterChain(ServerHttpSecurity http) {
    return http
      .csrf(ServerHttpSecurity.CsrfSpec::disable)
      .authorizeExchange(exchanges -> exchanges
        .pathMatchers("/auth/**", "/*/v3/api-docs", "/swagger-ui/**").permitAll()
        .anyExchange().authenticated()
      )
      .addFilterAt(jwtAuthFilter(), SecurityWebFiltersOrder.AUTHENTICATION)
      .build();
  }
}

同时在各业务服务添加服务间鉴权配置（目前完全缺失）
```

#### 3.4 MyBatis Plus 升级

```
[CLAUDE CODE] 升级 mybatis-plus 至 3.5.7：

主要 Breaking Changes：
1. IPage 泛型变更 → 检查所有 Page<T> 使用
2. LambdaQueryWrapper 部分方法签名变更
3. @Version 乐观锁注解迁移

扫描并修复：
find services/ -name "*.java" | xargs grep -l "IPage\|Page<" → 逐一检查
```

#### 3.5 Springfox 完全移除 & Springdoc 验证

```
[CLAUDE CODE] 确认 Phase 1 中 Springdoc 配置在 Spring Boot 3 环境下正确工作：

1. 删除所有 anynote-common-swagger 中旧 Springfox 配置类
2. 确认 @Configuration 中无 Docket bean
3. springdoc-openapi-starter-webmvc-ui:2.3.0 已与 Spring Boot 3.3 兼容
4. 运行 mvn test 验证各模块编译

对 WebFlux 模块（services/ai）额外检查：
- 使用 springdoc-openapi-starter-webflux-ui
- Mono<>/Flux<> 返回类型可被 Springdoc 正确序列化为 OpenAPI schema
```

#### 3.6 合并 ai + ai-nio 为单一 AI 服务

```
[CLAUDE CODE] 将 anynote-modules-ai 和 anynote-modules-ai-nio 合并为 services/ai：

分析两个模块职责：
- anynote-modules-ai（9210）：同步 AI 调用
- anynote-modules-ai-nio（9065）：SSE 流式 AI 调用（Reactor）

合并策略：
1. 以 ai-nio 为基础（已使用 Reactor，现代 WebFlux 方式）
2. 将 ai 模块中未覆盖的同步端点迁移到 services/ai
3. 使用 Spring WebFlux 将同步端点包装为 Mono<ResponseEntity<T>>
4. 统一端口为 9065，更新 Nacos 路由配置和 gateway 路由规则
5. 更新 ServiceNameConstants.java 删除 AI_SERVICE，仅保留 AI_NIO_SERVICE 改名为 AI_SERVICE
```

**验收标准**：`mvn clean package -DskipTests` 所有 services/* 模块成功构建，无编译错误。

---

### Phase 4：服务层重构（优先级 P2，耗时约 2 天）

**目标**：统一认证方式、修复错误处理、规范 REST 风格。

**前置条件**：Phase 3 完成

#### 4.1 统一异常处理

```
[CLAUDE CODE] 在 services/common 创建统一异常体系：

1. 创建 ErrorCode.java（枚举，取代魔法字符串 "00000"）：
   public enum ErrorCode {
     SUCCESS("00000", "成功"),
     UNAUTHORIZED("A0200", "未登录"),
     FORBIDDEN("A0300", "无权限"),
     NOT_FOUND("A0400", "资源不存在"),
     BUSINESS_ERROR("B0100", "业务错误"),
     SYSTEM_ERROR("C0100", "系统错误");
     
     private final String code;
     private final String message;
   }

2. 创建统一 GlobalExceptionHandler（每个服务一个）：
   @RestControllerAdvice
   public class GlobalExceptionHandler {
     @ExceptionHandler(BusinessException.class)
     public ResData<Void> handleBusiness(BusinessException e) {...}
     
     @ExceptionHandler(ConstraintViolationException.class)
     public ResData<Void> handleValidation(ConstraintViolationException e) {...}
   }

3. 修复 NoteController.java:88-89 的 return null，抛出 NotImplementedException

4. 修复所有 FallbackFactory 中 throw exception 改为 return 默认值
```

#### 4.2 统一 REST 规范

```
[CLAUDE CODE] 扫描所有 Controller，统一以下规范：

端点命名：
- 全部使用 /api/v1/{资源复数} 格式
- GET /api/v1/notes 列表
- GET /api/v1/notes/{id} 详情
- POST /api/v1/notes 创建
- PATCH /api/v1/notes/{id} 部分更新
- DELETE /api/v1/notes/{id} 删除

HTTP 方法语义：
- GET 幂等只读（不接 @RequestBody）
- POST 创建
- PUT 全量替换（慎用）
- PATCH 部分更新
- 废弃非标准路径如 /user/manageList → GET /api/v1/users?role=admin

需修改的非标准端点：
- /user/manageList → GET /api/v1/users
- /user/banUser → POST /api/v1/users/{id}/ban
- /user/unBanUser → POST /api/v1/users/{id}/unban
- /notes/bases/{baseId} → GET /api/v1/knowledge-bases/{id}/notes
```

#### 4.3 服务间鉴权加固

```
[CLAUDE CODE] 为所有 Feign 内部调用添加服务间认证：

问题：当前仅靠 "from-source" 字符串 header 识别内部调用，无签名验证

方案：添加 HMAC 签名或 mTLS
实现（简单方案-HMAC header）：

1. 在 services/common 创建 InternalAuthInterceptor（Feign RequestInterceptor）：
   - 在每个请求添加 X-Internal-Sign: HMAC(secret, timestamp+service-name)
   - 添加 X-Internal-Timestamp 和 X-From-Service

2. 在 services/gateway/filter/AuthFilter.java 验证内部 Header 签名

3. 在各服务 @InnerAuth 注解处理器中验证签名而非仅检查 header 存在
```

**验收标准**：Postman/curl 测试所有重命名后的端点返回正确数据，内部 Feign 调用正常工作。

---

### Phase 5：前端完全重写（优先级 P1，与 Phase 3 并行，耗时约 5-7 天）

**目标**：用现代技术栈完全重写前端，消除安全缺陷，引入自动类型生成。

**前置条件**：Phase 1 完成（API Client 生成流程）

#### 5.1 初始化 Next.js 15 项目

```
[CLAUDE CODE] 在 apps/web/ 初始化新项目（替换旧 anynote-next-web-dev 内容）：

cd apps
pnpm create next-app@latest web \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint  # 使用 biome 替代

cd web && pnpm add \
  @tanstack/react-query \
  @tanstack/react-query-devtools \
  zustand \
  react-hook-form \
  @hookform/resolvers \
  zod \
  axios \
  ky \
  next-themes \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  class-variance-authority \
  clsx \
  tailwind-merge \
  lucide-react

# shadcn/ui 初始化
pnpm dlx shadcn-ui@latest init

# 常用 shadcn 组件
pnpm dlx shadcn-ui@latest add button input form dialog dropdown-menu \
  sheet sidebar avatar badge card table tabs tooltip skeleton toast
```

#### 5.2 项目结构

```
apps/web/src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 无 Layout 路由组
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (main)/                   # 带主布局路由组
│   │   ├── layout.tsx            # 主布局（侧边栏 + header）
│   │   ├── dashboard/page.tsx
│   │   ├── notes/
│   │   │   ├── page.tsx          # 笔记列表
│   │   │   └── [id]/page.tsx    # 笔记详情/编辑
│   │   ├── docs/[id]/page.tsx
│   │   ├── mooc/page.tsx
│   │   ├── tasks/page.tsx
│   │   ├── settings/page.tsx
│   │   └── ai/page.tsx
│   ├── api/                      # Next.js Route Handlers（BFF层）
│   │   ├── auth/
│   │   │   ├── login/route.ts   # 处理 httpOnly cookie
│   │   │   └── logout/route.ts
│   │   └── [...proxy]/route.ts  # 可选：API 代理
│   ├── layout.tsx
│   └── providers.tsx
│
├── components/
│   ├── ui/                       # shadcn/ui 组件（自动生成）
│   ├── layout/                   # AppSidebar, AppHeader, AppNav
│   ├── editors/                  # Milkdown, Vditor 等编辑器封装
│   ├── note/                     # 笔记相关业务组件
│   ├── ai/                       # AI 聊天、工作流组件
│   └── common/                   # 通用业务组件
│
├── lib/
│   ├── api.ts                    # axios/ky 实例配置
│   ├── auth.ts                   # 认证工具
│   └── utils.ts                  # cn() 等工具函数
│
├── hooks/                        # TanStack Query hooks（代替 Redux）
│   ├── use-notes.ts
│   ├── use-auth.ts
│   └── ...
│
├── store/                        # Zustand（仅客户端 UI 状态）
│   ├── ui-store.ts               # sidebar open/close, theme 等
│   └── editor-store.ts
│
└── types/                        # 从 @anynote/api-client 重导出
    └── index.ts
```

#### 5.3 认证安全重构（核心改动）

```
[CLAUDE CODE] 修复 JWT Token 存 JS Cookie 的安全问题：

当前问题：
- userSlice.ts:14 将 token 存入 document.cookie（可被 JS 读取）
- 前端直接持有 JWT Token，XSS 即可盗取

新方案（BFF + httpOnly Cookie）：
1. 创建 apps/web/src/app/api/auth/login/route.ts（Next.js Route Handler）：

   export async function POST(request: Request) {
     const body = await request.json();
     const response = await backendLogin(body); // 调用后端 auth 服务
     
     // 将 token 存入 httpOnly Cookie（JS 不可读）
     const res = NextResponse.json({ user: response.user });
     res.cookies.set('access_token', response.token, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 7 * 24 * 60 * 60
     });
     return res;
   }

2. 创建 apps/web/src/lib/api.ts（API 客户端，自动携带 cookie）：

   import ky from 'ky';
   export const apiClient = ky.create({
     prefixUrl: process.env.NEXT_PUBLIC_API_URL,
     credentials: 'include',  // 自动携带 httpOnly cookie
     hooks: {
       afterResponse: [
         async (req, opts, res) => {
           if (res.status === 401) {
             await refreshToken(); // 刷新 token
             return ky(req, opts);
           }
         }
       ]
     }
   });

3. Zustand store（只存非敏感 UI 状态）：
   interface UIState {
     sidebarOpen: boolean;
     theme: 'light' | 'dark' | 'system';
     userProfile: { nickname: string; avatar: string } | null; // 非 Token
   }
```

#### 5.4 TanStack Query 数据层

```
[CLAUDE CODE] 创建 TanStack Query hooks（取代 Redux + SWR + 手写 requests）：

apps/web/src/hooks/use-notes.ts：
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { Note, CreateNoteRequest } from '@anynote/api-client';

// 使用 auto-generated 类型
export function useNotes(params: { baseId: string; page: number }) {
  return useQuery({
    queryKey: ['notes', params],
    queryFn: () => apiClient.get('api/v1/notes', { searchParams: params }).json<PageResult<Note>>(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoteRequest) => 
      apiClient.post('api/v1/notes', { json: data }).json<Note>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

类似地创建：
- hooks/use-auth.ts
- hooks/use-documents.ts
- hooks/use-knowledge-bases.ts
- hooks/use-ai-chat.ts（SSE 流式，使用 EventSource + useMutation）
```

#### 5.5 编辑器集成

```
[CLAUDE CODE] 保留 Milkdown 作为主编辑器，迁移至新项目：

创建 apps/web/src/components/editors/MilkdownEditor.tsx：
- 保留现有 Milkdown 插件配置（GFM, Math, Prism, Slash, Block）
- 使用 React.lazy + Suspense 懒加载（编辑器体积大）
- 通过 React Hook Form 的 Controller 集成

保留 Vditor 作为轻量备选：
- 创建 components/editors/VditorEditor.tsx
- 同样懒加载

删除 Wangeditor（功能与 Milkdown 重叠，减少包体积）
```

**验收标准**：
- `pnpm dev`（在 apps/web/ 执行）成功启动
- 登录页面可正常跳转，token 存在 httpOnly Cookie 中
- 笔记列表页面通过 `@anynote/api-client` 类型调用并渲染数据

---

### Phase 6：Python AI 服务现代化（优先级 P2，耗时约 1-2 天）

**目标**：升级 Pydantic v2，规范 OpenAPI 文档，完善类型标注。

**前置条件**：Phase 0 完成（目录迁移至 ai-service/）

#### 6.1 Pydantic v2 迁移

```
[CLAUDE CODE] 更新 ai-service/requirements.txt：

pydantic>=2.6.0
fastapi>=0.115.0
uvicorn[standard]>=0.29.0

迁移 Pydantic v1 → v2 语法（ai-service/model/ 下所有文件）：
- class Config: → model_config = ConfigDict(...)
- @validator → @field_validator
- .dict() → .model_dump()
- .parse_obj() → .model_validate()
- Optional[str] = None → str | None = None（Python 3.10+ 语法）
```

#### 6.2 完善 FastAPI 端点类型

```
[CLAUDE CODE] 为 ai-service/controller/ 所有端点添加：

1. response_model 参数（确保 OpenAPI schema 自动生成）
2. status_code 参数
3. tags 参数（用于 Swagger 分组）
4. summary 和 description

例如 chat_controller.py：
@router.post(
    "/v1/chat/completions",
    response_model=None,  # SSE 流式无 response_model
    status_code=200,
    tags=["chat"],
    summary="AI 对话（SSE 流式）",
    responses={
        200: {"description": "SSE 事件流"},
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    }
)
async def chat_completions(request: ChatRequest, ...):
    ...
```

#### 6.3 依赖注入重构

```
[CLAUDE CODE] 使用 FastAPI Depends 替代全局单例：

当前问题：core/ 下的 redis_server.py, minio.py 等使用模块级全局变量

重构：
ai-service/dependencies.py：
from functools import lru_cache
from core.config import Settings

@lru_cache
def get_settings() -> Settings:
    return Settings()

async def get_redis():
    yield redis_client  # 生命周期管理

在 controller 中：
@router.post("/...")
async def endpoint(
    settings: Settings = Depends(get_settings),
    redis = Depends(get_redis)
):
```

**验收标准**：`http://localhost:8000/docs` 显示完整的 AI 服务 OpenAPI 文档，所有端点有 schema。

---

### Phase 7：OpenSpec 集成（vibe coding 支持）（优先级 P2，耗时约 0.5 天）

**目标**：配置 .claude/ 目录结构，使 Claude Code 在后续开发中可利用 OpenSpec workflow。

**前置条件**：Phase 1 完成（OpenAPI 规范已建立）

#### 7.1 初始化 OpenSpec 目录

```
[CLAUDE CODE] 创建以下目录和初始文件：

.claude/
├── openspec/
│   ├── README.md               ← OpenSpec 使用说明
│   └── changes/                ← 已完成变更归档
└── context/
    ├── backend.md              ← 后端架构速查
    ├── frontend.md             ← 前端架构速查
    └── api-contracts.md        ← API 变更规范

.claude/context/backend.md 内容：
- 所有服务端口和职责
- 模块间依赖关系
- 认证流程说明

.claude/context/frontend.md 内容：
- 组件目录约定
- TanStack Query hooks 命名约定
- API 客户端使用方式
```

#### 7.2 建立 API 变更工作流

```
[CLAUDE CODE] 创建 openapi/WORKFLOW.md，描述 API-First 开发流程：

后端开发流程：
1. 先更新 Controller 的 @Operation/@Schema 注解
2. 运行 mvn spring-boot:run 启动服务
3. 运行 pnpm openapi:generate 更新前端类型
4. 前端使用新生成的类型开发

前端开发流程：
1. 如需新 API，在 .claude/openspec/changes/ 创建变更文档
2. 描述需要的端点、请求/响应结构
3. 由后端实现后执行生成脚本
```

---

## 五、并行任务矩阵

```
时间轴（周）：
         W1          W2          W3          W4          W5
Phase 0  ████
Phase 1       ████████
Phase 2  ████████
Phase 3           ████████████████
Phase 4                       ████████
Phase 5       ████████████████████████
Phase 6                   ████████
Phase 7                             ████
```

| Phase | 依赖 | 可与之并行 |
|-------|------|-----------|
| Phase 0 | 无 | 无 |
| Phase 1 | Phase 0 | Phase 2 |
| Phase 2 | Phase 0 | Phase 1, Phase 5(准备) |
| Phase 3 | Phase 2 | Phase 5 |
| Phase 4 | Phase 3 | Phase 5(后半段) |
| Phase 5 | Phase 1 | Phase 3, Phase 4 |
| Phase 6 | Phase 0 | Phase 3, Phase 4, Phase 5 |
| Phase 7 | Phase 1 | 任意 |

---

## 六、风险与注意事项

### 5.1 Spring Boot 3 升级风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| javax → jakarta 替换遗漏 | 编译失败 | 全文搜索 `javax.` 统一替换，编译验证 |
| Spring Security 6 API 变更 | 认证失效 | 优先在 dev 环境验证 |
| MyBatis Plus 3.5.7 破坏性变更 | 查询失败 | 对每个 Mapper 编写集成测试 |
| Nacos 客户端兼容性 | 服务发现失效 | 升级 Spring Cloud Alibaba 2023.x 对应版本 |

### 5.2 前端重写风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Milkdown 版本兼容性 | 编辑器不可用 | 固定 Milkdown 7.x，隔离测试 |
| API 类型生成不完整 | 编译错误 | 手动补全边缘类型，逐步迁移 |
| 功能回归 | 用户流程损坏 | 保留旧前端在 apps/web-legacy/ 直到验证 |

### 5.3 不建议做的事

- ❌ 不要在升级 Spring Boot 的同时重构业务逻辑，分步进行
- ❌ 不要同时迁移所有模块，优先 common → gateway → auth → 业务模块
- ❌ 前端重写期间不要更改后端 API 路径，等 Phase 5 完成后统一调整
- ❌ 不要删除旧前端目录直到新前端验证通过

---

## 七、验收 Checklist

### Phase 0 验收
- [ ] `ls apps/ packages/ services/ ai-service/ openapi/` 全部存在
- [ ] `pnpm install` 成功
- [ ] `turbo --version` 可执行

### Phase 1 验收
- [ ] `http://localhost:8080/swagger-ui.html` 显示所有服务 API 文档
- [ ] `pnpm openapi:generate` 在 `packages/api-client/src/` 生成 TypeScript 类型
- [ ] FastAPI `http://localhost:8000/docs` 显示完整文档

### Phase 2 验收
- [ ] `mvn clean install -DskipTests` 成功（services/ 根目录）
- [ ] `mvn enforcer:enforce` 无报错
- [ ] `mvn dependency:tree` 无版本冲突警告

### Phase 3 验收
- [ ] 所有模块 Java 17+ 编译成功
- [ ] Spring Boot 3.3 所有服务启动无错误
- [ ] AI 模块合并后 SSE 端点正常工作

### Phase 4 验收
- [ ] 所有端点符合 /api/v1/* 规范
- [ ] 内部 Feign 调用有签名验证
- [ ] 无 `return null` 未实现端点

### Phase 5 验收
- [ ] `pnpm dev` 新前端启动成功
- [ ] 登录后 token 仅在 httpOnly Cookie 中
- [ ] 笔记 CRUD 功能正常
- [ ] AI 聊天 SSE 流式响应正常
- [ ] 主题切换（暗色/亮色）正常

### Phase 6 验收
- [ ] `pip install -r requirements.txt` 成功（Pydantic v2）
- [ ] FastAPI 启动无警告
- [ ] 所有端点有完整 OpenAPI schema

### Phase 7 验收
- [ ] `.claude/` 目录结构完整
- [ ] `openapi/WORKFLOW.md` 描述清晰

---

## 八、Git 仓库管理方案

> 适用场景：个人开发为主，偶有 1-2 名协作者。目标是低摩擦、可追溯、与重构阶段对齐。

---

### 8.1 初始化仓库

当前工作目录尚未纳入 Git 管理，在 Phase 0 执行时一并初始化：

```bash
# 在项目根执行
git init
git add .gitignore   # 先只提交 .gitignore，避免提交编译产物
git commit -m "chore: init monorepo, add .gitignore"
git add .
git commit -m "chore: initial monorepo structure (Phase 0)"
```

`.gitignore` 需涵盖以下条目（新建 monorepo 级别的根 `.gitignore`）：

```gitignore
# Java
**/target/
*.class
*.jar

# Node
**/node_modules/
**/.next/
**/dist/
**/.turbo/

# Python
**/__pycache__/
**/*.pyc
**/.venv/
**/venv/

# IDE
.idea/
.vscode/
*.iml

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# Generated
packages/api-client/src/   # openapi 自动生成，不提交
openapi/specs/              # 运行时拉取，不提交
```

---

### 8.2 分支模型

采用**简化 Git Flow**，去掉 release 分支，保留三类分支：

```
main
 └── dev
      ├── phase/0-monorepo-infra
      ├── phase/1-openapi-contract
      ├── phase/2-maven-bom
      ├── phase/3-spring-boot3
      ├── phase/4-service-refactor
      ├── phase/5-frontend-rewrite
      ├── phase/6-python-ai
      └── fix/description
```

| 分支 | 保护 | 说明 |
|------|------|------|
| `main` | ✅ 只接受 PR/merge，不直接 push | 每个 Phase 验收通过后合并，打版本 Tag |
| `dev` | 否 | 日常集成分支，各 phase 分支合并到这里 |
| `phase/N-*` | 否 | 对应 REFACTOR_PLAN 的执行阶段，完成后合并至 dev 再删除 |
| `fix/*` | 否 | 紧急修复，从 `main` 切出，修复后同时合并回 `main` 和 `dev` |

**分支生命周期原则**：
- phase 分支在对应验收 Checklist 全部通过后合并，合并后立即删除远端分支
- 不允许长期存活的 WIP 分支，未完成的工作用 `git stash` 或 Draft commit 暂存

---

### 8.3 Commit 规范

遵循 **Conventional Commits**，格式：

```
<type>(<scope>): <subject>

[可选 body]
[可选 footer: BREAKING CHANGE / Closes #issue]
```

**type 取值**：

| type | 使用场景 |
|------|---------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（非功能变更） |
| `chore` | 构建脚本、依赖更新、目录调整 |
| `docs` | 文档变更 |
| `test` | 新增或修改测试 |
| `perf` | 性能优化 |
| `ci` | CI/CD 配置 |

**scope 取值**（对应模块）：

```
gateway | auth | system | note | file | ai | notify
web | api-client | ui
ai-service
bom | infra | openapi
```

**示例**：

```bash
git commit -m "refactor(note): migrate javax.* to jakarta.* namespace"
git commit -m "feat(web): implement httpOnly cookie auth via BFF route"
git commit -m "chore(bom): upgrade Spring Boot to 3.3.4, Spring Cloud to 2023.0.3"
git commit -m "fix(gateway): resolve concurrent 401 race condition in token refresh"

# 破坏性变更
git commit -m "refactor(ai): merge ai + ai-nio into unified services/ai module

BREAKING CHANGE: port changed from 9210 to 9065, update Nacos route config"
```

---

### 8.4 版本标签策略

每个 Phase 验收通过并合并到 `main` 后打 Tag，采用语义化版本：

```
v0.1.0  ← Phase 0 完成（Monorepo 基础设施）
v0.2.0  ← Phase 1 完成（OpenAPI Contract）
v0.3.0  ← Phase 2 完成（Maven BOM）
v0.4.0  ← Phase 3 完成（Spring Boot 3 升级）
v0.5.0  ← Phase 4 完成（服务层重构）
v0.6.0  ← Phase 5 完成（前端重写）
v0.7.0  ← Phase 6 完成（Python AI 现代化）
v1.0.0  ← Phase 7 完成（全量验收，可对外发布）
```

打 Tag 命令：

```bash
git tag -a v0.1.0 -m "Phase 0: Monorepo infrastructure complete"
git push origin v0.1.0
```

---

### 8.5 日常工作流

```bash
# 1. 开始一个 phase
git checkout dev
git pull origin dev
git checkout -b phase/3-spring-boot3

# 2. 日常提交（小步快跑，每个原子变更一次 commit）
git add services/gateway/src/...
git commit -m "refactor(gateway): upgrade to Spring Boot 3.3.4"

# 3. 中途同步 dev（如有协作者并行推进）
git fetch origin dev
git rebase origin/dev   # 优先 rebase 保持线性历史

# 4. Phase 完成，合并到 dev
git checkout dev
git merge --no-ff phase/3-spring-boot3 -m "chore: merge phase/3-spring-boot3 into dev"
git push origin dev

# 5. Dev 验收通过，合并到 main 并打 Tag
git checkout main
git merge --no-ff dev -m "release: v0.4.0 Spring Boot 3 upgrade complete"
git tag -a v0.4.0 -m "Phase 3: Spring Boot 3.3 + JDK 21 upgrade complete"
git push origin main --tags

# 6. 清理 phase 分支
git branch -d phase/3-spring-boot3
git push origin --delete phase/3-spring-boot3
```

---

### 8.6 远端仓库建议

| 选项 | 建议 |
|------|------|
| 托管平台 | GitHub（私有仓库），或 Gitea 自托管 |
| 默认分支 | `dev`（日常推送目标） |
| main 保护规则 | 禁止 force push；要求通过本地构建验证后才 merge |
| 协作者权限 | Write 权限到 `dev` 和 `phase/*`，`main` 仅 Owner 可 merge |

**推荐的 `push` 规则**（solo 场景可不强制 PR，但 main 保护建议保留）：

```bash
# 设置 main 分支默认拒绝直接 push（仅 GitHub 侧设置即可）
# 日常只需：
git push origin dev
git push origin phase/N-*
```

---

### 8.7 Monorepo 提交颗粒度建议

由于 monorepo 跨越三种语言栈，避免混杂提交：

- **一次 commit 只改一个 service 或一个 package**，不跨层（不把 Java 改动和前端改动混在同一个 commit）
- Phase 分支内部允许 WIP commit，在合并到 dev 前用 `git rebase -i` 整理为清晰的原子 commit
- 自动生成的文件（`packages/api-client/src/`）不提交，在 CI 中重新生成
