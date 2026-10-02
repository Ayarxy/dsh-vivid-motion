# dsh-vivid-motion

DSH Web 界面动效**聚合包**（空壳 bundle）：自身不含功能代码，通过 `cordis.patch.yml` 把 `packages/` 下的组件包挂进配置树。结构与官方 `dsh-experimental-agent-team-profile` 相同——一个插件、多个可独立开关的组件，每个组件有自己的名字。聚合包适合直接安装使用现有组件，也适合作为模板扩展新的动效组件；安装步骤见「安装」一节，组件行为与限制见「组件」一节。

## 组件

| 组件 | 包 | 效果 |
| --- | --- | --- |
| dsh-click-spark | `packages/dsh-click-spark` | 鼠标点击粒子动效：在指针落点甩出一圈放射状短线，「干脆」预设——临界阻尼弹簧位移曲线，冲出去就停，不回弹、不旋转、不拖尾 |
| dsh-copy-toast | `packages/dsh-copy-toast` | 剪贴板确认 toast：有效的复制或剪切事件，或成功的非空剪贴板写入，在底部居中弹出「已复制」/「已剪切」；果冻弹簧入场、堆叠最多 4 枚、可按住拖动丢弃 |

`dsh-copy-toast` 的入场/退场/堆叠动画改自一份独立的 HTML 原型（`已复制-toast-dsh.html`）：原型的 DOM 结构、弹簧参数与拖动交互被逐条搬进 `lib/client.js`，类名加上 `dct-` 前缀，配色从写死的浅色调换成主题 token。

### dsh-click-spark

| | |
| --- | --- |
| 触发 | 主键按下（`pointerdown`，捕获阶段，`passive`） |
| 形状 | 以指针为圆心严格均分 8 条短线，不旋转、不抖动 |
| 位移 | 阻尼弹簧解析解，`stiffness 620 / damping 50 / mass 1` → ζ ≈ 1.004 |
| 时长 | 300 ms（线尾同时用 ease-out 收到 0 长度） |
| 颜色 | 跟随主题 `--dsw-alias-label-primary` |

「干脆」的全部参数取自 ClickSpark 参数调试台该预设的原始数值：

```js
{ stiffness: 620, damping: 50, mass: 1, duration: 300,
  sparkCount: 8, sparkRadius: 15, sparkSize: 10, extraScale: 1, sparkColor: null }
```

### dsh-copy-toast

| | |
| --- | --- |
| 触发 | 有内容的可信 DOM 复制或可编辑选区剪切，以及成功的非空异步剪贴板写入（见下「剪贴板事件的两条通路」） |
| 文案 | 复制「已复制」、剪切「已剪切」（英文 Copied / Cut），走 Client 的 `locale` 服务 |
| 位置 | 底部居中，距底 26 px，挂在 `shell.overlay` 插槽里 |
| 入场 | 从下方 52 px 弹上来的果冻动画：位移弹簧 `520 / 26`，位移越大拉得越扁，并按速度做运动模糊 |
| 堆叠 | 最多 4 枚；后一枚把前面的上移 12 px、缩小 5%（同样是弹簧），并给它们一次果冻抖动 |
| 停留 | 2000 ms；悬停或按住时暂停倒计时，松手后仍悬停时继续暂停；悬停整摞纵向展开，卡片间隙保持展开；主键左右拖动超过 64 px 时丢弃，否则回弹，手势取消或捕获丢失只回弹不丢弃 |
| 退场 | 先压扁再下沉 16 px 淡化消失 |
| 颜色 | 面板 `--dsw-alias-bg-layer-1`、边框 `--dsw-alias-border-l1`、文字 `--dsw-alias-label-primary`、阴影 `--dsw-shadow-lv3`；图标底色 `--dsw-static-deepseek-450`（两套主题下都是品牌蓝） |

**剪贴板事件的两条通路。** 组件同时观察 DOM 事件和异步 API：

1. **可信的 DOM `copy` / `cut` 事件**：捕获阶段挂在 `document` 上，覆盖 Ctrl/Cmd+C、Ctrl/Cmd+X、右键菜单，以及宿主 `writeClipboard()` 在异步 API **缺失**时使用的 `execCommand("copy")` 兜底路径。脚本手动派发的合成事件不确认。
2. **`navigator.clipboard.writeText` / `.write`**——原生异步 API 不触发 `copy` 事件，因此逐方法包装实际持有该函数的对象：一般是原型，也支持实例自有覆盖。保留原参数、`this`、原返回对象、异常和 Promise 的成功/失败语义；提示自身出错不影响复制结果。

异步 API 仅在写入**成功且有非空载荷**时确认。当前宿主在 API 拒绝时直接返回 `false`，**不会再次执行 `execCommand`**。一次同步 API 调用内部的嵌套写入和 `execCommand` 事件共享同一个操作标识，只确认一次；不同的连续复制各自确认，不使用时间窗口去重。

DOM 默认复制要求非空选区。`preventDefault()` 不一定代表复制失败：自定义监听器用 `clipboardData.setData()`（或 `items` 方法）写入非空载荷后再取消默认动作的 **copy**，仍会确认；取消但不写入、最后清空载荷均不确认。组件在事件派发期间观察数据变化，下一个 task 只判断保存的快照并恢复临时方法，不读取已经失效的原生数据存储。

**cut** 要求选区可编辑：原生默认剪切照常确认；编辑器取消默认动作、自行写入非空剪贴板载荷时，还会核对输入值或编辑区文本是否确实删除了原选区，成功才确认「已剪切」。这覆盖 DSH 的 Lexical 编辑器剪切路径；仅写入数据、只移动光标或塌陷选区而未删除原文，均不确认。

**空动作不弹。** 事件目标是输入框 / `textarea` 时，以该控件自身的选区为准；否则检查聚焦的文本控件，最后才使用普通 DOM 选区。文本控件中的光标塌陷时立即判空，不借用页面残留选区。`writeText("")`、标准空字符串对象及 `write([])` 都不确认；只读或禁用控件、普通不可编辑文本的剪切不确认。

**覆盖边界**：

- iframe 内的事件不会冒泡到本页；历史接口、无可读选区的默认 `execCommand` 复制仍可能漏报。
- DOM 事件没有系统剪贴板写入结果回执，其默认动作只能依据可信事件和有效选区推断。
- 为避免重复执行用户的转换或迭代代码，不确认未知自定义 `toString` 或非标准数组迭代载荷。
- 无法安全包装的 DataTransfer 方法，或绕过临时包装调用已保存的原生方法，其最终载荷变化无法可靠判定（可能漏报或快照过期）。
- 第三方在异步调用栈已退出后另行执行 `execCommand`，无法可靠关联操作，仍可能出现双提示；不为此抑制正常的连续复制。
- 原生异步 API 拒绝时不确认。

### 「已剪切」

在输入框、`textarea` 或 DSH 编辑器中选中文字后，按 **Ctrl+X / Cmd+X** 或使用右键菜单的「剪切」，底部会弹出「已剪切」（英文界面为 `Cut`），使用与「已复制」相同的堆叠、停留和拖动动效。DSH 编辑器自行处理剪切的路径也支持：写入有效载荷并删除选区后才确认，不把 `preventDefault()` 一概视为失败。

没有选区、只读文本、单纯取消操作，或仅复制却没有删除原文，都不弹「已剪切」。组件只观察当前 Web 页面中的剪切，不监听其他应用。

### dsh-copy-toast 与宿主自身的「已复制」

宿主的复制按钮已经有一处**就地标签**反馈（`useCopyFeedback`：按钮文字 1 秒变「已复制」，不是 toast），且**写入失败完全静默**。本组件与它叠加：按钮文字变化的同时，底部再弹一枚小 toast。如果只保留其中一个，在 Plugin Manager 里关闭本组件行即可。剪切没有这层重叠——宿主不提供剪切的确认。

## 安装

clone 后先在聚合包目录（本目录）安装一次依赖——组件以裸包名引用，通过 `file:` 依赖生成的 `node_modules` 符号链接解析：

```
npm install
```

然后本地安装（本仓库目录即包目录）：

```
dsh plugin --profile desktop add link:D:\Code\dsh\plugins\dsh-vivid-motion
```

或在 Desktop 应用里：打开「设置 → 插件 → 添加插件」，填入本目录的绝对路径，安装完成后点击「立即启用」。

启用后除刷新外无需其他步骤。在 Plugin Manager 里可以按组件（行）独立开关；停用某行即完全卸载该组件。

## 实现要点

聚合包自身只有空的 `lib/index.js`，全部行为在各组件包内。两个组件都是**纯浏览器组件**：`lib/index.js` 的宿主半边只有空的 `apply()`，全部行为在 `lib/client.js`。两者都只产生 DOM 副作用，因此整个挂载就是一个 `ctx.effect`（或 slot 注册），停用对应组件行即完全卸载。

### dsh-click-spark

- **挂载位置**：canvas 直接挂在 `document.body` 上，使用 `position:fixed; inset:0`、很高的 `z-index` 和 `pointer-events:none`。这样它位于 shell 的 `[data-shell-overlay]`（z-index 20）之上，不受 app frame 的 `overflow:hidden` 裁剪，同时绝不拦截任何点击。
- **零帧开销**：只有存在存活动效时才运行 `requestAnimationFrame`；最后一圈结束后循环自动停止，空闲页面不排帧。多个元素各自独立推进，不会互相改写。
- **弹簧是解析解**：直接从时间 `t` 求值，不做逐帧积分，因此既没有累积漂移，也不需要每帧重建状态。
- **主题跟随**：描边色读取一次 `--dsw-alias-label-primary` 后缓存（避免每次点击触发样式重算）；`MutationObserver` 监听 `body[data-ds-dark-theme]` 变化时使缓存失效。
- **无障碍**：`prefers-reduced-motion: reduce` 时直接不触发。

### dsh-copy-toast

- **挂载位置**：使用插槽而不是 `document.body`——`shell.overlay` 是 shell 官方的「与所有列平级、不受滚动容器裁剪」的浮动层（`position:absolute; inset:0; z-index:20; pointer-events:none`，由 layout 声明），文案中明确写了 toast 栈应放在这里。使用新的 `id`（`dsh-copy-toast`）是**新增插槽**而非替换，与既有各条 overlay 并存。
- **分层**：React 只负责渲染这一个层元素及其 `<style>`；层里的每一枚 toast 由命令式引擎（`createToastStack`）创建和管理。弹簧是逐帧数值解，必须操作真实元素，两者这样分工最直接；React 侧的 vdom 里这个层没有任何 children，所以两边永远不会 reconcile 同一个节点。层元素由框架卸载，引擎在 `useEffect` 的清理函数里 `dispose()`。
- **样式**：`<style>` 随组件一起渲染和移除；所有类名带 `dct-` 前缀（样式表是全局的）；配色只引用 `--dsw-alias-*` / `--dsw-static-*` 主题 token，并把设计稿原值写成 fallback，token 改名只会轻微影响观感，不会渲染失败。
- **复制监听**：监听器与剪贴板补丁装在**独立的 `ctx.effect`** 里，所以 overlay 槽暂时未挂载时监听仍在生效，但不缓存或补发那段时间的提示。停用先使旧观察器失活并撤销待执行的事件计时器；未完成的 Promise 和被第三方包装保留的旧补丁即使之后执行，也不会再触发确认。仅在当前方法仍是自己的包装时恢复原描述符，不误撤第三方补丁。
- **文案**：`已复制` / `已剪切`（`Copied` / `Cut`）通过 Client 的 `locale` 服务注册（`ctx.get("locale")` 获取，该服务可能不存在），`locale` 缺席时按 `<html lang>` 回退；`bind(ns)` 得到的翻译函数在**调用时**读当前语言，所以切换语言不需要重新注册。
- **无障碍**：`role="status"`（polite，不是 `alert`）；`prefers-reduced-motion: reduce` 时入场/退场动画压到 1 ms，堆叠、悬停展开、拖动逻辑保留。
- **拖动与命中**：每枚 toast 只有一个变换动画拥有者；重新抓住会取消旧回弹/抖动并从当前视觉位置接管。回弹的底层样式预先归零，动画结束不留下拖动位移。取消手势或丢失捕获只回弹；捕获不可用或静默失败时用 document 监听收尾，松手后立即移除。透明/退场卡片不接收点击，展开层的实际矩形覆盖卡片之间的间隙。
- **生命周期**：停用会移除 `copy` / `cut` 监听器、撤销或失活自己的剪贴板包装、注销 locale 字典、撤销全部计时器和动画（含图标、回弹、抖动、退场），并移除层元素和全部 toast。

## 新增组件

1. 在 `packages/` 下新建组件包，包含 `package.json`（`name: <组件名>`、`dsh.client.platform: "web"`、`exports["./client"]`）、`lib/index.js`（宿主半边）和 `lib/client.js`（浏览器半边）。
2. 在聚合包 `package.json` 的 `dependencies` 中加入 `"<组件名>": "file:packages/<组件名>"`，然后执行一次 `npm install`。
3. 在 `cordis.patch.yml` 的 insert 列表中加入一行 `{id: <组件名>, name: <组件名>}`；可以添加 `config:` 字段，每行配置互相独立。
4. 重启应用生效。

## 结构注意事项

以下约束均来自 DSH 运行时代码，违反会导致组件加载失败或静默消失：

- **浏览器模块 `id` 恒等于组件包名**：`lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 `id` 必须与组件包 `package.json` 的 `name` 完全一致。boot graph 按包名查找 factory，不匹配时脚本虽然执行，但模块注册不上。
- **一个包 = 一个浏览器模块节点**：同一个组件包不能靠多次 `__ModuleLoader__.load` 注册出多个组件。若一个包要贡献多个 UI 片段，在它唯一的 `apply(ctx)` 里注册多次（如多个 slot）。
- **行 `id` 全局唯一、可自由命名**：`cordis.patch.yml` 里每行的 `id` 是配置树的寻址键，只要求整棵树内唯一，不必等于包名（但建议一致，便于对照）。修改 `id` 后，Plugin Manager 里按旧 `id` 记录的开关和配置覆盖会失配（残留行无害，但禁用状态不迁移）。
- **组件行的显示名来自组件包的 meta**：优先读组件包 `locale/<语言>.json` 顶层 `meta` 键下的 `title`/`description`，没有语言文件则回退到 `package.json` 的 `name`/`description`。加语言文件时 `en.json` 必须存在，且组件包 `exports` 要包含 `"./locale/*.json"` 映射，否则 meta 读取被静默跳过。
- **组件行必须能以裸包名解析**：行的 `name` 写裸包名，通过聚合包 `file:` 依赖与 `npm install` 产生的 `node_modules` 符号链接解析——因此 clone 后必须先 `npm install`。`name` 也支持相对路径（如 `./packages/foo/lib/index.js`，指向文件），功能正常；但路径形式的 specifier 读不到包 meta，Plugin Manager 里组件标题会显示成一串 file URL，不推荐。
- **聚合包的 `lib/index.js` 不会被 import**：运行时只 import 各行的 `name`，聚合包入口仅为满足包解析规范而存在，保持空实现即可。
- **改聚合包的 `cordis.patch.yml` 不会热重载**：HMR 只监听 profile 层和 `$DSH_HOME` 层的 patch 文件。修改后需重启应用，或在 Plugin Manager 里切换一次任意组件的开关（会触发全量重读）。
- **patch 语法错误会让整个聚合包静默消失**：patch 文件解析失败时，该聚合包层被整体跳过（记录在 skippedBundles），插件从配置树消失而不报错。修改后组件没有出现，先检查 YAML 语法。
- **组件需要宿主侧能力时**：在组件包 `lib/index.js` 的 `apply(ctx)` 里消费或提供服务；浏览器侧通过组件包自己的 client 模块与之配合。不要把宿主代码放进聚合包。

## 调参

- `packages/dsh-click-spark/lib/client.js` 顶部的 `PRESET`（数值含义与原调试台一致）；或把 `sparkColor` 设为 `"#rrggbb"` 使用固定颜色。
- `packages/dsh-copy-toast/lib/client.js` 顶部的 `TOAST`：`duration`（停留 ms）、`maxVisible`、`stackOffset` / `stackScale` / `stackGap`（堆叠几何），以及 `entrance` / `snapBack` / `wobble` / `slot` / `icon` 五组 `{stiffness, damping}`。紧邻的 `CSS` 常量控制外观。

client 模块会被浏览器缓存；未运行构建或 HMR watcher 时，源码变化不能靠重复开关保证更新。修改本组件已经生成的[客户端产物](<packages/dsh-copy-toast/lib/client.js>)后，重启 DSH 应用并重新加载页面，以重新读取客户端产物；本仓库没有额外的 TypeScript / Vite 构建步骤。不要另起 Web 服务器来代替正在使用的 GUI。

## 目录

```
package.json                       聚合包清单：dsh.bundle.patch + file: 组件依赖
package-lock.json                  锁定 file: 链接关系（建议提交）
cordis.patch.yml                   bundle 挂载声明（每个组件一行 insert）
lib/index.js                       空壳入口（不会被 import，仅供解析）
packages/dsh-click-spark/          组件包：点击粒子动效
  package.json                     组件清单：dsh.client.platform = web
  lib/index.js                     宿主半边（空实现，仅供 loader 解析）
  lib/client.js                    浏览器半边：canvas 覆盖层 + 弹簧动画
packages/dsh-copy-toast/           组件包：复制确认 toast
  package.json                     组件清单：dsh.client.platform = web, immediately = true
  lib/index.js                     宿主半边（空实现，仅供 loader 解析）
  lib/client.js                    浏览器半边：复制监听 + shell.overlay 上的 toast 栈
```
