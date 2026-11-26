# LocalFirst 隐私病历/票据脱敏台 — 2 分钟演示视频脚本（中英双语字幕）

- **总时长**：2 分钟（120 秒），完整覆盖 5 大核心镜头（端侧病历 / 端侧票据离线 / 云端降级提示 / 云端深度分析与跨文档异常报告 / 本地还原闭环）
- **核心叙事**：讲透「为什么必须是 Hybrid AI」——纯云端会泄露病历/票据隐私且断网停摆；纯端侧难以胜任多文档跨账单稽核；LocalFirst 把 **亚毫秒级本地脱敏 + 离线 Gemini Nano 提炼** 留在端侧，仅在用户预览确认后把 **编号占位符** 交给云端 **Gemini 3.5 Flash Lite** 做跨文档算账与异常核对，最后在本地内存一键还原真名。
- **验证基线**：
  - 30 条边界测试集（`npm run test:redact`）：精确率 100.0%（0 误伤）、规则覆盖内召回率 100.0%（45/45）、含无标签裸姓名已知边界总召回率 97.8%（45/46），本地脱敏平均耗时 ~0.10 ms。
  - 端侧病历样例（5 项隐私）与票据样例（4 项隐私）跨文档共享会话编号（`[姓名1]` vs `[姓名2]`），医院/诊断/药名/药房名全部保留，断网零请求。
  - 云端模型统一为 `gemini-3.5-flash-lite`（Firebase AI Logic），实测可稳定检出主体不一致、重复购药、明细与实付差额 10 元等跨文档异常。
- **拍摄准备**：
  1. Chrome 138+ 已开启两个端侧 AI Flag，确认左上端侧徽章为绿色 **`端侧 Nano 就绪 · On-Device`**（避免处于 `Download Needed` 态导致录屏中触发模型下载）。
  2. **务必使用生产构建预览录屏**：运行 `npm run build && npm run preview`，打开 `http://127.0.0.1:8123`（避免 Vite 开发服务器 HMR/ping 请求出现在 Network 面板中干扰“0 请求”画面）。
  3. 确认 `.env.local` 已就绪且浏览器窗口为 1920×1080（首屏可同屏展示顶部双徽章、流程条、指标条、左右输入输出区）；提前打开 Chrome DevTools **Network** 面板停靠在底部或右侧备用。
  4. 后期剪辑时全程叠加下方 **EN Subtitle** 英文字幕，方便国际评委无障碍观看。

---

## 分镜脚本（6 节 · 120 秒）

### 镜头 1：痛点开场 + 首屏直入（0:00 – 0:12）
- **画面内容**：全屏展示 1920×1080 主界面首屏——顶部独立双徽章（绿：`端侧 Nano 就绪 · On-Device`、蓝：`云端就绪 · Cloud Ready`、隐私徽章：`数据未离开本机 · Data stays local`）、三步双语流程条、紧凑指标条与「一键演示」入口（**不点端侧自检，直接进入业务演示**）。
- **操作步骤**：
  1. 停留 3 秒展示清晰首屏。
  2. 直接点击 **`一键演示：病历 · Medical`**（`#btn-quick-medical`）。
- **中文口播**：「整理病历和报销票据时，直接发给云端 AI 会泄露姓名、身份证和银行卡，断网也用不了。LocalFirst 采用端云混合架构——敏感隐私留在本地，只把脱敏占位符交给云端。我们直接演示一份门诊病历。」
- **EN Subtitle**: "Uploading medical records and receipts to cloud AI risks leaking personal IDs and fails offline. LocalFirst keeps PII on-device and sends only placeholders to the cloud. Let's run a medical record."

---

### 镜头 2：端侧病历脱敏（左右对照）+ Nano 提炼（0:12 – 0:40）
- **画面内容**：聚焦右侧输出卡的 **左右对照面板**（左：原文仅留本机；右：脱敏后彩色 `<mark>` 高亮占位符 `[姓名1]`、`[身份证号1]`、`[手机号1]`、`[地址1]`、`[邮箱1]`）、脱敏分类标签与下方的 3 条 Nano 提炼要点，以及顶部指标栏刷新出的 **`本地脱敏 < 1 ms`** 与 **`端侧 Nano 秒级`** 数值。
- **操作步骤**：
  1. 等待 `01 本地脱敏` 与 `02 端侧提炼` 依次变为完成态（`is-done`），内存缓存计数更新为 `1 份（#1 门诊病历）`。
  2. 鼠标扫过左右对照区与脱敏芯片：指出 5 项隐私在浏览器本地毫秒内替换为编号占位符，“北京协和医院呼吸内科”“急性支气管炎”“阿莫西林胶囊”全部保留；映射表仅存内存。
  3. 扫过下方 3 条端侧 Gemini Nano 提炼的核心要点。
- **中文口播**：「可以看到，5 项个人隐私在不到 1 毫秒内完成本地脱敏，医院、诊断和药名完整保留，占位符按会话编号为 `[姓名1]`。随后本机 Gemini Nano 在几秒内提炼出 3 条核心要点，全程数据未离开设备。」
- **EN Subtitle**: "In under 1 millisecond, 5 PII items become numbered placeholders like [Name1] while preserving hospital, diagnosis, and medication facts. On-device Gemini Nano summarizes 3 takeaways in seconds—nothing leaves the machine."

---

### 镜头 3：断网模式 → 端侧票据离线运行（0:40 – 1:02）
- **画面内容**：页面与 Chrome DevTools **Network** 面板同屏显示，放大 Network 顶部 **Offline** 勾选框与清空后的 **0 requests** 请求列表；同时关注顶部 **云端徽章自动变为黄色 `当前离线 · Cloud Offline`**，而 **端侧 Nano 徽章保持绿色正常**。
- **操作步骤**：
  1. 在 DevTools Network 面板勾选 **Offline**，点击清空网络日志图标（此时云端徽章自动切为离线提示）。
  2. 点击 **`一键演示：票据 · Receipt`**（`#btn-quick-receipt`）。
  3. 展示右侧结果：4 项隐私完成本地脱敏，并自动延续全局编号为 **`[姓名2]`、`[手机号2]`、`[银行卡号1]`、`[地址2]`**（与病历的 `[姓名1]` 区分开！）；“上海仁济大药房张江分店”与明细完整保留；Nano 离线输出 3 条要点；内存缓存计数升至 **`2 份（可跨文档对比）`**；Network 面板全程 **0 requests**。
- **中文口播**：「现在在 DevTools 里勾选 Offline 断网。注意顶部只有云端徽章变为离线，端侧 Nano 依然绿色就绪。再一键运行报销票据——断网照样跑通！持卡人自动编号为 `[姓名2]`，不会和病历里的 `[姓名1]` 相撞，药房名称完好保留，Network 面板零请求。」
- **EN Subtitle**: "Now let's switch Chrome DevTools to Offline. Only the Cloud badge goes amber—On-Device Nano stays green. Running the pharmacy receipt succeeds with 0 network requests, numbering the cardholder as [Name2] so it never collides with patient [Name1]."

---

### 镜头 4：降级提示镜头 — 离线触发云端对比与一键恢复（1:02 – 1:16）
- **画面内容**：保持 **Offline** 状态，演示隐私预览、体面降级卡片与联网自动恢复重试。
- **操作步骤**：
  1. 保持 Offline，点击 **`云端跨文档对比 (2 份) · Cloud Cross-Doc`**（`#btn-cloud`）。
  2. 展开 **「即将发送至云端的内容预览」**：快速停留 2 秒展示只有彩色占位符、没有任何真名与卡号。
  3. 点击 **`确认仅发送脱敏文本 · Confirm & Send`** → 触发结构化 **离线降级卡片**：端侧 Nano 徽章仍为绿色，提示「内存已保留 2 份本地脱敏文档，无需重新输入」，展示可折叠「技术详情」与 **`立即重试 · Retry Cloud`** 按钮。
  4. 在 DevTools 取消勾选 **Offline** → 顶部云端徽章自动恢复为 **`云端已恢复 · 点击重试`** → 直接点击降级卡片里的 **`立即重试 · Retry Cloud`**。
- **中文口播**：「如果断网时点击云端对比，系统先展示即将发送的纯占位符预览；确认后触发安全降级卡片，保留 2 份内存文档且不影响端侧能力。恢复网络后，云端状态自动检测就绪，点一下立即重试即可继续。」
- **EN Subtitle**: "Triggering cloud audit while offline first shows a placeholder-only payload preview, then degrades gracefully—keeping both cached docs intact and local Nano unaffected. Back online, the badge auto-recovers; one click retries."

---

### 镜头 5：云端深度分析 + 跨文档异常报告 + 本地一键还原（1:16 – 1:50）
- **画面内容**：聚焦流程条点亮 `03 云端对比`、隐私徽章更新为 **`云端仅接收 2 份脱敏文本 · Redacted Only`**、右侧结构化【云端跨文档对比报告】、顶部指标栏三项延迟并排对比（`本地脱敏 < 1 ms` / `端侧 Nano` / `云端 Gemini 含网络`），以及收尾高光操作 **`在本地还原真名 · Local Restore`**。
- **操作步骤**：
  1. 云端 `gemini-3.5-flash-lite` 返回报告后，高亮展示其抓出的跨文档异常：
     - **主体不一致与跨城**：病历患者 `[姓名1]`（北京协和医院）≠ 票据付款持卡人 `[姓名2]`（上海仁济大药房张江分店）；
     - **疑似重复购药**：11/18 门诊已开阿莫西林胶囊，11/20 又续购阿莫西林胶囊；
     - **金额勾稽差额**：明细之和 433.00 元与实付总金额 443.00 元相差 10.00 元；
     - **非疾病项混入**：健康体检挂号费 150.00 元混入疾病报销。
  2. 特写顶部指标栏：对比 **本地脱敏（< 1 ms）**、**端侧 Nano（离线秒级）**、**云端 Gemini（含网络秒级）**。
  3. **高光收尾动作**：点击输出区右上角 **`在本地还原真名 · Local Restore`** → 顶部弹出绿色提示条「仅在本机内存还原显示，云端从未收到隐私原值」，报告中的 `[姓名1]`/`[姓名2]` 就地高亮还原为 `张三`/`李明`；停留 3 秒后再点一次切回占位符态。
- **中文口播**：「云端 Gemini 3.5 Flash Lite 在完全不知道真名的情况下，一眼揪出多项跨文档异常：患者 `[姓名1]` 与持卡人 `[姓名2]` 不一致且跨城、阿莫西林 2 天内重复购药、明细 433 元与实付 443 元差了 10 元。审阅时点一下『在本地还原真名』，仅用内存映射把 `[姓名1]` 和 `[姓名2]` 还原成张三和李明，云端自始至终从未见过原值。」
- **EN Subtitle**: "Without ever seeing real names, cloud Gemini 3.5 Flash Lite catches every cross-doc anomaly: patient [Name1] differs from cardholder [Name2] across cities, duplicate Amoxicillin within 2 days, and a 10-yuan total mismatch. Click Local Restore to re-hydrate real names strictly in browser memory."

---

### 镜头 6：收尾总结（1:50 – 2:00）
- **画面内容**：回到完整工作台界面，突出独立双徽章、三步流程条与延迟指标，叠加中英标题卡 `LocalFirst Privacy Workbench — On-Device Redaction · Cloud Cross-Doc Audit`。
- **操作步骤**：无额外点击，静止展示 5 秒。
- **中文口播**：「隐私脱敏与离线提炼留在端侧 Nano，跨文档深度稽核只把占位符交给云端 Gemini，再在本地内存还原查看——这就是 LocalFirst Privacy Workbench，感谢观看！」
- **EN Subtitle**: "Keep PII on-device with Gemini Nano, audit placeholders in the cloud with Gemini, and restore locally in memory. That's LocalFirst Privacy Workbench. Thanks for watching!"
