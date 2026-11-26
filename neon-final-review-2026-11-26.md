# LocalFirst 隐私病历/票据脱敏台 — Neon 终审优化总结（2026-11-26）

> 本次终审基于 `opus-review-2026-11-26.md` 全部意见（H1–H9、M1–M11、L1–L9）逐条核对与落实，严格遵守红线：
> - 未改动 `src/cloud.ts` 的 Firebase App Check 逻辑与 `.env.local` 密钥；
> - 完整保留病历与票据样例原有虚构隐私原值（张三/身份证/手机号/地址/邮箱；李明/手机号/银行卡号/地址）及机构名，仅按 H2 强化两份文档间的业务关联与可核查异常；
> - 映射表严格仅存内存，不落盘、不外发；新增「清空内存」与「本地还原真名」均纯内存闭环。

---

## 一、Opus 评审意见逐条处置清单

### 高优先级（必须改 · H1–H9）

| 编号 | 评审项 | 处置 | 具体落地 / 跳过原因 |
| --- | --- | --- | --- |
| **H1** | 跨文档占位符相撞（正确性 bug） | **已改** | `src/redact.ts` 新增 `RedactSessionState` 与 `createRedactSession()`，支持 `redactText(raw, session?, customTerms?)` 共享会话级映射与计数，同一原值跨文档复用同一编号、不同人/手机号/地址分别编号为 `[姓名1]` / `[姓名2]`、`[手机号1]` / `[手机号2]`、`[地址1]` / `[地址2]`；同会话已识别姓名可跨文档传播；每份文档返回的 `mapping` 仍仅包含当前文档命中的条目，单文档统计准确，全局恢复使用 `session.mapping`。 |
| **H2** | 两份样例互不相关，跨文档报告缺亮点 | **已改** | 保留 `SAMPLES.medical` 原文及 `SAMPLES.receipt` 全部 4 项原始虚构 PII（李明、13900139000、6222021001123456789、上海市浦东新区张江路666号201室）与商户名（上海仁济大药房张江分店），在票据明细与备注中关联 11/18 急性支气管炎门诊并埋入 4 项可稳定复现的跨文档异常：①患者 `[姓名1]` ≠ 持卡人 `[姓名2]` 且京沪跨城；②阿莫西林胶囊 2 天内重复购药；③明细之和 433.00 元 ≠ 实付总金额 443.00 元（差额 10 元）；④混入非疾病项（健康体检挂号费 150 元、口罩体温计 68 元）。同步增强 `src/cloud.ts` 的跨文档核对 prompt 要求原样保留占位符并核验上述维度。 |
| **H3** | 文档/代码/文案模型版本号矛盾 | **已改** | 全仓库统一为实际验证通过的 **`gemini-3.5-flash-lite`**（Gemini 3.5 Flash Lite），清零 `README.md`、`devpost.md`、`demo-script.md` 中全部旧版 `2.5` 字样（grep 扫描 0 命中）。 |
| **H4** | 宣传口径夸大，与实测不符 | **已改** | 全面清除 `index.html`、`src/`、`README.md`、`devpost.md`、`demo-script.md` 中的「零误伤」「Zero-leakage」「zero false positives」「彻底杜绝隐私泄露」与无限定「100% locally」；改用可验证口径（如 30 条测试集精确率 100.0% / 含已知边界总召回率 97.8%、样例医院/诊断/药名/商户全部保留）；将「毫秒级」严格限定于本地正则脱敏（`< 1 ms`），Nano 改述为「秒级离线提炼」。 |
| **H5** | Firebase AI Logic 混合路由未真实走主路径 | **已改（采用方案 B）** | 经阅读 `@firebase/ai` 源码 `ChromeAdapterImpl` 评估：方案 A 将主路径切给 SDK `PREFER_ON_DEVICE` 存在三项风险——①未配 `.env.local` 时端侧无法直接启动；②`downloadable` 时 SDK 会静默回退云端（违背 M6 知情同意）；③`ChromeAdapterImpl` 的消息格式在未实机复测的 Chrome 138 构建上存在兼容性风险。因此采纳 Opus 给出的 **方案 B**：保留已实测 PASS 且保证离线 0 请求的 Chrome Prompt API (`src/ondevice.ts`) 作为端侧主路径；`README.md`、`devpost.md`、`demo-script.md` 如实表述「端侧直接调用 Chrome Prompt API，Firebase AI Logic (`gemini-3.5-flash-lite`) 负责云端跨文档分析与用户确认后的回退」，删去对主路径 `runtime attribution` 的夸大表述。 |
| **H6** | App Check 关闭导致部署与文案口径风险 | **部分落实（代码与文案已改；Console 运维待协调者）** | 遵守红线未动 `src/cloud.ts` 的 App Check 逻辑与 `.env.local`。①删除 `README.md`、`devpost.md`、`demo-script.md` 中所有「relaxing App Check / 关闭强制校验」与内部备注，Built With 移除 `Firebase App Check`；②重写 `src/main.ts` 的 401 降级提示为面向终端用户的安全表述（「云端身份校验未通过，请刷新页面或稍后重试」），开发者排查说明收入可折叠 `<details>` 技术详情，不再教用户关闭安全开关。③**待协调者部署前执行**：在公开托管前于 Firebase Console 配置 reCAPTCHA v3 site key、重新开启 App Check enforcement、并在 GCP 为 API Key 添加 HTTP Referrer 限制与预算告警。 |
| **H7** | 演示脚本缺「降级提示」镜头且开场浪费 | **已改** | 重写 `demo-script.md`（120 秒 6 节）完整覆盖五大镜头：痛点直入病历 → 端侧病历左右对照脱敏+提炼 → 断网票据 0 请求 → **Offline 触发云端预览与安全降级卡片 + 恢复在线一键重试** → 云端跨文档异常报告 + 本地一键还原真名 → 收尾；删掉开场英文 `scaffold` 自检（同时将 `src/main.ts` 的 `handlePing` 文案改为干净的 `"Local Gemini Nano is ready offline."`），同步更新 `devpost.md` 的 5 步 Walkthrough 并删除所有内部备注。 |
| **H8** | 面向国际评委界面与脚本只有中文 | **已改** | 界面核心标题、双徽章、三步流程条、指标标签、操作按钮、预览/降级/还原面板全面升级为紧凑中英双语标签；`demo-script.md` 每个分镜补齐 `EN Subtitle` 英文字幕；`devpost.md` 与 `README.md` 明确说明主场景针对中国大陆病历/票据格式，同时提供 `EN Sample` 供英语评委即时体验。 |
| **H9** | 缺少公开试用入口与构建 sourcemap 处理 | **部分落实（构建与文档已改；线上部署待 H6 完成后执行）** | ①`vite.config.ts` 关闭生产构建 `sourcemap: false`（`dist/` 无 `.map` 文件）；②`README.md` 顶部补充快速本地预览与「未启用 Nano 时会看到什么」说明；③按 Opus 结论，因 H6 App Check 尚未在 Console 开启强制校验，未在 `devpost.md` 放裸奔公网链接，待协调者完成 H6 后再部署 Firebase Hosting。 |

---

### 中优先级（建议改 · M1–M11）

| 编号 | 评审项 | 处置 | 具体落地 |
| --- | --- | --- | --- |
| **M1** | 首屏信息层级与徽章字号 | **已改** | 重构 `index.html` 与 `src/style.css`：合并一键演示、紧凑指标行与内存计数为单行 `.control-bar`，压缩流程条高度（顶部总高约 200px），1920×1080 首屏同时完整呈现输入区、左右脱敏对照、输出要点与三项延迟；徽章字号提升至 `0.9rem`。 |
| **M2** | 状态枚举与流程条语义不准确 | **已改** | `src/ui.ts` 将原始枚举名替换为中英双语人话（如 `端侧就绪 · Ready (Local)`、`需下载模型 · Download Needed`）；修正 `local_done` / `cloud_done` 为 `is-done`（不再停留 `is-active`）；新增 `local_only_done` / `local_fallback` / `local_fallback_done` 流程态区分单文档回退与跨文档分析；Nano 徽章不再直接暴露原始 `available`/`downloadable` 枚举。 |
| **M3** | 启用 `restoreText` 实现「云端只看占位符，本地还原真名」 | **已改** | 在输出工具栏新增 **`在本地还原真名 · Local Restore`** 切换按钮，仅在浏览器内存用 `restoreText(..., redactSession.mapping)` 将 `[姓名1]`/`[姓名2]` 等高亮还原为真名并展示绿色声明横幅（云端从未收到原值），支持一键切回占位符；复制按钮默认始终复制脱敏文本防止剪贴板泄露。 |
| **M4** | 云端发送前预览、占位符高亮、左右对照 | **已改** | ①新增 `#compare-pane` 原文（仅留本机）vs 脱敏后（彩色 `<mark>` 高亮占位符）左右对照（原文严格独立于 `#output-box`，确保输出区无原值泄露）；②点击云端对比或云端回退前必先展开 `#cloud-preview-panel` 预览纯占位符负载并经用户确认；③云端模式下隐私徽章显示 `云端仅接收 N 份脱敏文本 · Redacted Only`。 |
| **M5** | 降级体验（徽章分离、自动恢复、超时、403/404/429、非阻塞本地） | **已改** | ①拆分为独立 `#engine-badge`（端侧 Nano）与 `#cloud-badge`（云端 Gemini），云端异常/离线不染黄端侧徽章；②监听 `online`/`offline` 事件自动切换云端状态并在恢复后提示点击重试；③降级卡片内提供 **`立即重试 · Retry Cloud`** 按钮与可折叠技术详情；④`src/cloud.ts` 增加 20 秒 `AbortController` + `timeout` 超时保护，并拆分 `setLocalBusy` / `setCloudBusy` 确保云端请求期间本地按钮可用；⑤`classifyCloudError` 补齐 401/403/404/429/超时/离线/未配置全分支。 |
| **M6** | Nano 不可用时的首屏与回退隐私承诺漏洞 | **已改** | Nano 不可用时首屏显示 `端侧 Nano 未就绪 · Local Redact Only` 与可展开 Chrome Flags 指南，隐私徽章保持 `数据未离开本机`；按钮文案动态切换为 `本地脱敏 + 云端提炼（仅发脱敏文本）`（未配云端时为 `仅执行本地脱敏`），点击后先本地脱敏展示结果，再通过发送前预览让用户明确确认是否回退云端。 |
| **M7** | 端侧提炼失败隐藏脱敏结果；`downloadable` 伪装就绪 | **已改** | ①`handleLocalRedactAndExtract` 的 `catch` 分支若 `redaction` 已成功，优先保留并展示脱敏文本与左右对照，仅提示提炼未完成；②`downloadable` 状态独立映射为 `Nano 需先下载模型 · Download Needed` 警告态及状态提示，不再伪装为离线已就绪。 |
| **M8** | 脱敏规则修补 + 黄金测试集量化 + 兜底手段 | **已改** | ①引入机构名哨兵保护（先保护医院/药房/公司再跑地址与姓名规则，修复「北京协和医院位于…」和「金石 / 金石化工有限公司」）；②新增病历号/医保号/护照号/微信号/QQ号/出生日期/单号（流水号、订单号、发票号）规则并置于银行卡之前，未带标签银行卡增加 BIN + Luhn 校验；③补齐固话、`LABELED_NAME_RE` 前瞻 `男|女|\d`（排除吞字）、`NAME_STOP` 亲属称谓与动词（修复 `患者付费`/`家属：父亲`）、放宽 `和欧阳女士` 前置词；④README 明确医生姓名默认保留策略；⑤界面提供「自定义补充脱敏词」输入框兜底；⑥新增 30 条黄金测试集 `scripts/test-redact.mjs`（`npm run test:redact`）。 |
| **M9** | Nano 语言参数 `en` 与中文输入不匹配 | **已改** | `src/ondevice.ts` 改为先探测 `availability(ZH_LANG)`，仅在浏览器声明支持 `zh` 时启用 `zh`，否则无感回退至已实测稳定的 `en` 声明，并暴露 `getActiveNanoLanguage()` 在徽章/自检中透明显示。 |
| **M10** | 延迟指标拆开展示 | **已改** | 指标条拆分为三项：**本地脱敏（`< 1 ms`）**、**端侧 Nano（≥1s 自动以秒显示，并在支持 `session.clone()` 时复用基会话降低重建开销）**、**云端 Gemini（明确标注「含网络」）**。 |
| **M11** | Devpost 文案结构与 Built With | **已改** | 统一 `index.html` `<title>` 与 `<h1>` 补回「病历」；`devpost.md` 重构为标准 7 段结构（Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next + 5 步 Walkthrough），Built With 改为 8 个标准技术标签，精简验证结论。 |

---

### 低优先级（可选优化 · L1–L9）

| 编号 | 优化项 | 处置 | 说明 |
| --- | --- | --- | --- |
| **L1** | 内存文档管理（清空按钮、缓存列表、`---` 提示） | **已改** | 新增「清空内存 · Clear」按钮（同步清空文档与 `redactSession`）、内存文档标签列表 `#memory-docs-list`，textarea placeholder 补充 `---` 多文档分隔提示。 |
| **L2** | 仅 1 份文档时云端按钮文案动态切换 | **已改** | 0–1 份显示 `云端深度分析 (1 份) · Cloud Audit`，≥2 份显示 `云端跨文档对比 (N 份) · Cloud Cross-Doc`，云端 prompt 同步适配单/多文档。 |
| **L3** | 录屏建议使用 `npm run preview` 避免 HMR 干扰 | **已改** | 已写入 `demo-script.md` 拍摄准备与 `README.md` 启动说明。 |
| **L4** | 复制失败状态超时恢复 + 强调仅复制脱敏文本 | **已改** | `handleCopyOutput` 成功/失败均 1.8s 后恢复按钮文案，且始终仅复制脱敏文本并提示 `已复制（仅含脱敏文本）`。 |
| **L5** | 可访问性（`aria-live` 与 `<label>`） | **已改** | 顶部徽章区、指标区、输出区添加 `aria-live="polite"`，为 `#input-text` 与 `#custom-terms` 补充正式 `<label for="...">`。 |
| **L6** | 增加英文样例与英文基础 PII 规则 | **已改** | 新增 `EN Sample` 按钮与英文带标签姓名、SSN、美式电话、英文地址规则，并纳入 `scripts/test-redact.mjs` 回归验证。 |
| **L7** | 清理死代码（`void lastRedaction` / 未使用 `restoreText`） | **已改** | `restoreText` 已在 M3 落地，`void lastRedaction;` 已移除。 |
| **L8** | 替换空 Favicon | **已改** | `index.html` 换用内联 SVG 盾牌+锁头 favicon 及页面 `<meta name="description">`。 |
| **L9** | 修正 Node 版本声明与 Chrome flags 验证日期 | **已改** | 实查 `vite@8.3.8` `engines` 为 `^20.19.0 \|\| >=22.12.0`，已将 `README.md` 从 `Node.js 18+` 修正为 `Node.js 20.19+ or 22.12+`，并标注 Chrome 138+ flags 验证日期 `2026-11-26`。 |

---

## 二、改动文件清单

- **修改（12 个文件）**：
  - `src/redact.ts` — 会话级跨文档不冲突占位符、机构名哨兵保护、Luhn+上下文银行卡、病历/医保/单号/固话/护照/微信/QQ/出生日期/英文规则、自定义敏感词
  - `src/ondevice.ts` — `zh` → `en` 语言探测、`session.clone()` 隔离复用
  - `src/cloud.ts` — 新增 20 秒超时保护（`AbortController` + `timeout`）、增强跨文档/单文档核对 prompt（**未改动 App Check 逻辑与 `.env.local`**）
  - `src/ui.ts` — 关联异常票据样例（保留全部原有虚构 PII）+ 英文样例、双语状态与流程条语义、拆分端侧/云端徽章与 busy 状态、占位符/还原词 `<mark>` 安全高亮渲染、左右对照/预览/降级/还原面板控制
  - `src/main.ts` — 会话级脱敏状态管理、本地还原切换、云端发送前预览确认、独立降级卡片与一键重试、`online`/`offline` 监听、401/403/404/429/超时分类、内存清空与脱敏复制
  - `index.html` — 统一含「病历」的标题、SVG 盾牌 favicon、紧凑 1080p 双语首屏结构、左右对照/预览/降级/自定义词/Nano 指南/可访问性属性
  - `src/style.css` — 1080p 首屏紧凑布局、放大徽章、占位符与还原高亮样式、对比/预览/降级面板样式
  - `vite.config.ts` — 生产构建关闭 `sourcemap: false`
  - `package.json` — 新增 `"test:redact": "node scripts/test-redact.mjs"`
  - `README.md` — 统一 `gemini-3.5-flash-lite`、 honest 混合架构口径、无 Nano 体验说明、测试集量化数据、医生姓名策略、Node 20.19+/22.12+ 版本声明
  - `devpost.md` — 标准 Devpost 结构、新标题与短 Tagline、干净 Built With 标签、5 步 Demo Walkthrough、统一 `gemini-3.5-flash-lite`
  - `demo-script.md` — 重写 2 分钟 6 节分镜（含 Offline 降级提示与本地还原高光）、全段 EN Subtitle、删除内部备注与夸大口径、`npm run preview` 录屏指引
- **新增（2 个文件）**：
  - `scripts/test-redact.mjs` — 30 条黄金脱敏与跨文档会话/还原/Luhn 自动化断言脚本
  - `neon-final-review-2026-11-26.md` — 本终审总结报告

---

## 三、自测结果

1. **Node 黄金测试集（`npm run test:redact`，Node v24.22.1）**：**PASS**
   - 跨文档会话编号验证：病历 5 项（`张三 -> [姓名1]` 等）、票据 4 项（`李明 -> [姓名2]` 等），跨文档零碰撞，医院/诊断/药名/药房名完整保留，`restoreText` 双向还原通过。
   - 30 条边界测试集（覆盖 Opus 全部探针反例 + 英文样例 + 自定义敏感词 + 跨文档姓名传播）：
     - 规则覆盖内（29 条 / 45 目标）：**精确率 100.0%（FP=0）**，**召回率 100.0%（45/45）**；
     - 含已知边界（无标签无上下文裸姓名 `今日张三来院复诊并取药`，30 条 / 46 目标）：**精确率 100.0%（FP=0）**，**总召回率 97.8%（45/46）**；
     - 平均脱敏耗时：**0.087 ms**（< 1 ms）。
2. **TypeScript 类型检查与生产构建（`npm run build`：`tsc --noEmit && vite build`）**：**PASS（零报错）**
   - 产物：`dist/index.html`（9.95 kB）、`dist/assets/index-*.css`（9.81 kB）、`dist/assets/index-*.js`（106.37 kB），确认无 `.map` 文件。
3. **口径与红线回归检查**：
   - 全仓库 grep 检索旧版本号 `2.5` 及禁用/夸大词（`零误伤`/`Zero-leakage`/`zero false positives`/`彻底杜绝`/`relaxing App Check`/`enforcement relaxed`/`二哈`/`scaffold`/`关闭强制校验`）：**0 命中**。
   - `git diff -- src/cloud.ts` 确认 `ensureAppCheck`、`FIREBASE_CONFIG`、`getFirebaseApp` 零改动；`.env.local` 未改动。
4. **后续交由协调者在临时机复验事项**：
   - Chrome 138+ 端侧 Nano 实机跑通 `npm run preview` 全 5 镜头（重点验证 `zh`→`en` 探测、`session.clone()`、Offline 0 请求、云端跨文档报告异常检出与本地还原）；
   - 如需公网部署 Firebase Hosting（H6/H9），请先在 Firebase Console 开启 App Check (reCAPTCHA v3) 强制校验并配置 GCP API Key Referrer 限制。
