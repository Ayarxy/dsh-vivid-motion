# dsh-vivid-motion

DSH Web 界面动效聚合包（空壳 bundle）：自身不含功能代码，通过 `cordis.patch.yml` 把 `packages/` 下的组件包挂进配置树，每个组件在 Plugin Manager 里独立成行、独立开关。结构与官方 `dsh-experimental-agent-team-profile` 相同，可直接安装使用，也可作为新增动效组件的模板。

## 组件

| 组件 | 效果 |
| --- | --- |
| dsh-click-spark | 点击粒子动效：指针落点甩出 8 条放射状短线，临界阻尼弹簧位移（`stiffness 620 / damping 50 / mass 1`），300 ms 结束，不回弹、不旋转、不拖尾；颜色跟随主题 token |
| dsh-copy-toast | 剪贴板确认 toast：复制或剪切成功时在底部居中弹出「已复制」/「已剪切」（英文 Copied / Cut）；果冻弹簧入场，最多堆叠 4 枚，悬停暂停倒计时，停留 2000 ms，可按住左右拖动超过 64 px 丢弃 |
| dsh-smooth-caret | 平滑输入光标：聊天富文本编辑器与询问作答 textarea 的临界阻尼位移、彗星拖尾，可独立切换 500 ms 闪烁、选择颜色与粗细 |
| dsh-reasoning-slider | 模型与推理强度滑块：读取宿主模型目录，拖动预览、松手提交；当前模型最高档显示紫色流动与粒子 |

四个组件都是纯浏览器组件：宿主侧 `lib/index.js` 为空实现，全部行为在 `lib/client.js`，通过 `ctx.effect` 或插槽注册挂载，停用对应组件行即完全卸载。默认配色引用 `--dsw-*` 主题 token，平滑光标也可使用用户指定的颜色；文案通过 Client 的 `locale` 服务注册，该服务缺席时按 `<html lang>` 回退。`prefers-reduced-motion: reduce` 时，dsh-click-spark 不触发，dsh-copy-toast 动画压到 1 ms，dsh-smooth-caret 恢复原生光标，dsh-reasoning-slider 关闭过渡、缩放与粒子动画。

### dsh-reasoning-slider 的实现与验证

生产入口 `lib/client.js` 由组件包内的 `scripts/sync-reference.mjs` 从 `tests/reasoning-visual.html` 直接生成。原 HTML 的滑块组件及其 DOM、CSS、着色器、运动函数逐字复用；1,588 字节的原始呈现依赖代码也完整保留，运行时替换其中的定位函数，按用户要求居中弹窗并协调面板切换动画。`scripts/host-adapter.mjs` 明确列出宿主适配：ModelPicker 的异步提交、等待状态下的导航与焦点、弹窗内容容器、居中定位与切换动画，以及组件外层的形状隔离和溢出规则；不能把整份业务控制器也称作逐字不变。不要手工修改生成入口。修改范围仅为此组件，不重写聚合包或其他组件；后续修改前先完整阅读本 README。

参考文件冻结不动，SHA-256 为 `bc6d51e80ab18dd1f41229d9007e118eb55ca6357d3c2bedb136f20eb0591e28`。生成入口可随插件独立分发，运行时不读取测试文件。同步与核验命令为：

```bash
node packages/dsh-reasoning-slider/scripts/sync-reference.mjs
node packages/dsh-reasoning-slider/scripts/sync-reference.mjs --check
```

HTML 外层的组件颜色与字体也直接提取：包括固定蓝紫色、浅色/深色调色板、system-ui 字体和按钮继承规则。仅把页面级继承规则限定到入口与弹窗，避免覆盖其他 DSH 界面；不再将参考页的 `--surface` 映射成宿主背景色。深色切换沿用参考页的 `body.dark` 条件。演示页标题、调试按钮、640px 展示舞台和模拟模型目录不装入生产组件。React 和模块注册使用宿主运行时，模型目录与提交继续使用原组件中已有的 `modelDirectories.directoryFor(sessionId)` 接口。

popup 默认位于按钮上方，两者的垂直中轴重合，间隔 8px。定位使用按钮的视口坐标和弹窗未受入场动画影响的布局尺寸；靠近窗口边缘时保留 12px 边距，顶部空间不足且下方能容纳时放到下方。打开期间观察按钮与弹窗内容的尺寸变化，并响应外部滚动和窗口缩放，切换面板或按钮文案变宽后仍会重新对齐。关闭或停用时移除观察器和事件监听。

在 popup 内展开模型列表时，外框从原高度向上展开，使用 `stiffness 420 / damping 32 / mass 1` 的阻尼弹簧，520 ms 内完成轻微回弹；列表同步上移 12px 并在 140 ms 内淡入。通常保持下沿与按钮的 8px 间隔，空间不足时沿用边界避让。切回推理强度也连续过渡；中途反向或内容变高时，从当前显示的位置和速度继续。动画只调整外框高度/位置与内容位移，不缩放文字；独立内容容器保持列表滚动区域稳定，最大高度按弹窗实际内边距与边框计算。焦点和模型选择立即可用，列表滚动与聚焦不会中断展开。减少动态效果时立即切换；关闭、停用时取消动画，不留持续帧循环。动画使用浏览器 Web Animations API，不支持时直接切换。

宿主主题有全局 `corner-shape:var(--dsw-corner-shape)`，变量为 `superellipse(1.5)`，会把参考页 `border-radius:50%` 的圆形画成圆角方形。适配样式只在入口、弹窗及其后代/伪元素上恢复 `corner-shape:round`，宿主其他界面不受影响。弹窗以 `overflow:clip` 隔离最高档的装饰粒子，避免出现滚动条并改变轨道宽度；原模型列表继续自行滚动，长错误信息在自身区域滚动。滑块的几何、事件处理、动画时长和弹簧参数均不改动。

参考演示的选择接口默认立即返回；真实 `ModelDirectory.select()` 则等待宿主 `selectModel`，后者会查询供应商模型可用性并解析调用配置。只复制源码不能让这两个环境的等待表现相同。现在同一模型的档位等待期间仍可继续操作，界面立即显示最新意图，保持 `aria-busy` 和正在应用的状态直到真实回执。每次松手/键盘/滚轮选择立即发起第一个请求；后续选择只保留最新未发送档位，按顺序提交，不增加防抖延迟、不并发争抢、不绕过宿主验证。中间回执不覆盖最新位置，最终失败显示原错误并回到实际确认的值；停用、锁定或切换会话后不发送旧队列。模型切换仍保持等待期间禁用，避免跨模型混用档位。插件没有优化宿主 RPC 本身的耗时。

切档时，入口箭头始终保留同一个 SVG 节点，popup 标题保持可读和可导航，消除原来 `busy` 替换箭头、禁用文字按钮导致的透明度闪烁。等待期间仍可查看模型列表；实际模型选项保持禁用，搜索 Enter 也检查等待状态，防止与档位请求并发。没有搜索框且所有选项均禁用时，焦点落在弹窗上，Escape / Tab 仍可退出。`aria-busy`、状态播报及错误提示继续反映真实请求。

- 模型列表没有「默认 / 推荐模型集」项，也没有顶部返回按钮和「选择模型」标题行。
- 输入栏按钮在 popup 打开、关闭及切换面板时均保持「模型名 + 推理强度」，只随实际选择或拖动预览更新档位文案。
- 紫色流动、粒子和标签变色绑定当前模型公布的最高档位，不绑定 `ultra` 等具体 ID。保留真实模型、供应商及档位 ID，不把参考页的模拟目录接入生产。
- 输入栏的最高档文字与 popup 使用同一最高档判断和 `--rs-purple` 色值；色值直接从参考 HTML 提取。切回其他档位时恢复输入栏原有文字颜色，提交失败回退时颜色随档位同步。
- 使用宿主模型目录和选择接口；拖动只预览、松手提交，处理取消、失败、等待状态、键盘、滚轮、减少动态效果及卸载清理。
- `conversation.input.model` 是单入口插槽，优先级必须唯一；其他订阅组件可能使用 `-10`，本组件可使用 `-20`。停用应恢复宿主原入口，不修改宿主代码。
- 用户要求自行测试且不要打开 DSH。离线验证与真实界面验证要如实区分，不因 HTML 能显示就声称宿主集成已通过。

原代码保留 256 px 面板、24 px 轨道和 28 px 滑块，位置过渡为 300 ms（拖动为 150 ms），使用原有的弹簧参数和连续反向运动算法。最高档使用原 WebGL 流动、两秒遮罩揭示、14 个轨道粒子、16 个散射粒子和标签变色。提交档位不会重建滑块；退出最高档保留效果 300 ms 完成淡出，期间返回最高档继续使用原实例。减少动态效果时关闭过渡、缩放和粒子，WebGL 仅绘制静态帧。滚轮使用参考页原有的方向和累计阈值逻辑。

当前验证脚本为 `tests/reasoning-exact-reference.mjs`、`tests/reasoning-popup-motion.mjs` 与 `tests/reasoning-exact-host.mjs`；旧脚本与研究资料保留，但不作为当前版本的验证结论。逐字检查覆盖原样滑块、CSS、运动函数、着色器和全部呈现依赖；整份生成入口按明确的宿主适配核验。离线动效测试对比 DOM、运动采样及模拟 WebGL 清理；弹窗测试使用可控几何与 Web Animations 记录验证向上展开、轻微回弹、中途反向、尺寸变化、边界避让、即时焦点、内部滚动、减少动态效果和关闭清理。离线宿主测试使用实际提取的静态模块、Cordis、渲染器和 ModelDirectory，验证加载、真实 ID、调色板、两种插槽注册顺序和停用恢复，并以可控延迟验证请求合并、等待期间连续操作、回执不打断拖动、失败/异常回退、卸载丢弃待发选择。闪烁回归通过 MutationObserver 记录即时提交、延迟提交和失败过程中的中间 DOM 变化，检查箭头节点保持、标题没有短暂禁用及透明度变化，并验证等待期间的模型选择拦截与键盘焦点。宿主角形状测试读取实际主题 CSS，检查覆盖规则匹配；JSDOM 不计算/绘制 `corner-shape`，这些检查不能当作圆形像素或滚动几何验收。

遵照用户要求不启动、操作或重启 DSH，不发送聊天消息，不修改宿主安装文件。浏览器协议限制继续有效；未做实际界面、GPU 或滚动几何复测，也未确认运行中的 client-hmr 是否加载此版本。代码一致性检查不能证明运行中的界面已经更新。

### dsh-smooth-caret 的定位与动效

在「设置 → Vivid Motion → dsh-smooth-caret」调整启用状态、彗星拖尾、独立闪烁，以及 1 / 2 / 3 px 粗细。颜色菜单为「跟随主题 / 蓝色 / 萨尔萨红 / 自定义」，萨尔萨红为 `#FD3A4A`。自定义色使用圆角弹窗，支持拖动选色、键盘调色与 `#RRGGBB` 十六进制输入，点击「应用」后保存；取消保留原色。独立栏目通过 `settings.section` 注册，控件复用宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 `Switch`、`Menu`、`Button`、`Input` 和 `Modal`。默认启用平滑移动与拖尾，闪烁默认关闭；开启闪烁后采用亮 500 ms、灭 500 ms 的节拍。设置以 `dsh-vivid-motion:smooth-caret:v1` 为键保存在本浏览器，立即生效；存储受限时仍可在当前页面使用。

此组件独立编写，只参考 [smooth-cursor 的功能说明](https://github.com/Lacquervii/smooth-cursor) 与 [Issue #1 的场景描述](https://github.com/Lacquervii/smooth-cursor/issues/1)，未引入其源码或资源。

- **活动端点定位**：富文本直接折叠到 Selection 的 `focusNode / focusOffset`，正向、反向划选都跟随活动端；textarea 使用 `selectionDirection` 选择端点，选区结束位置或方向变化都会触发测量。
- **空行与软换行**：先处理 `<br>`、空段落和段落边界，再读取 Range 矩形，避开空矩形和浏览器回吸上一行的情况；不会向真实编辑器插入测量节点，也不改动选区或正文。
- **复用测量**：textarea 共用一个离屏镜像和 Range，保留焦点前后的完整文本、字体、换行、双向文本与滚动偏移；仅在文本变化时替换镜像文本。
- **裁剪与回退**：绘制区域是编辑器、各级滚动裁剪祖先与可视视口的交集，覆盖 `[data-input-scroll]` 和询问 textarea 自身滚动；端点不可见或无法可靠测量时恢复原生光标。只有成功定位后才隐藏当前编辑器的原生光标。
- **按需动画**：事件合并到下一帧读取几何；动画帧只推进临界阻尼解析解与固定容量、按时间过期的拖尾，不反复测量 DOM，也不分配全屏 Canvas。停稳后停止 JS 帧循环，可选闪烁交给 CSS。切换输入框、跨行、滚动和大距离跳转会清空拖尾并直接定位。
- **组合输入**：IME 期间保留平滑光标并暂停闪烁，跟随真实选区的活动端点，支持预编辑文字内部移动。组合事件与 `beforeinput / input` 合并后测量，额外最多两帧复核延迟的选区更新；宿主替换文字节点时短暂保留有效位置。仅在真实选区暂不可用且 DOM 已完成预期替换时，才使用 `beforeinput` 提供的局部范围辅助定位；不根据未插入的组合文字猜测坐标。提交 / 取消后复核最终位置，兼容末次 `input` 早于或晚于 `compositionend`；不会改动正文、焦点或真实选区，候选窗仍由原生输入法定位。候选停留期间没有持续轮询；无法恢复有效位置时仍会安全退回原生光标。
- **生命周期**：失焦、页面隐藏、停用、强制颜色模式及减少动态效果时恢复原生光标；停用撤销监听器、观察器、动画帧、组合输入状态、设置插槽、语言注册与测量节点。

支持范围是当前文档中的 DSH 横排聊天编辑器（`[data-composer-input]`、旧版 `textarea[data-phase]`）与询问作答框（`[data-question-key] textarea`、`[data-question-scroll] textarea`）。不接管普通设置输入框、只读 / 禁用字段、不可编辑内容节点、竖排编辑器或原生 dialog 内的输入，也不跨 iframe。任意旋转变换和自定义编辑器布局不在适配范围内。

本地回归脚本、排版夹具和截图统一放在 `tests/`，由 `.gitignore` 排除，不随组件分发。真实输入法候选窗与宿主 GUI 的最终效果仍需在 DSH 中确认；合成 DOM 事件不能替代真实输入法测试。

### dsh-copy-toast 的确认逻辑

同时观察两条通路，仅在写入成功且载荷非空时确认：

1. 可信的 DOM `copy` / `cut` 事件：捕获阶段挂在 `document` 上，覆盖快捷键、右键菜单，以及宿主在异步 API 缺失时使用的 `execCommand("copy")` 兜底路径；脚本派发的合成事件不确认。
2. 包装 `navigator.clipboard.writeText` / `.write`：原生异步 API 不触发 `copy` 事件，逐方法包装实际持有该函数的对象，保留原参数、`this`、返回值与异常语义；提示自身出错不影响复制结果，API 拒绝时不确认。

其他规则：

- 原生剪切与 DSH Lexical 编辑器自行处理的剪切都要求选区可编辑且原文确实被删除；`beforeinput` 阻止删除、仅写入数据、只移动光标或塌陷选区均不确认。仅剪切 `<br>` 换行或合并段落时，也会检查相应结构是否被删除，等价的 DOM 重建不算删除。
- 空选区、`writeText("")`、`write([])`、仅含空载荷的 `ClipboardItem`、只读或禁用控件上的剪切均不确认。`write()` 成功后通过原生 `ClipboardItem` 接口检查各格式的 Blob，至少一种格式非空才提示；原 API 的 Promise 和异常保持不变。
- 一次同步调用内的嵌套写入只确认一次，连续复制各自确认，不用时间窗口去重；异步载荷检查完成前停用组件也不会补发提示。
- 宿主在异步 API 拒绝时直接返回 `false`，不会再次执行 `execCommand`；`preventDefault()` 不一定代表失败，写入非空载荷后取消默认动作的复制仍会确认。

已知限制：

- iframe 内的事件不会冒泡到本页；DOM 事件没有系统剪贴板回执，无可读选区的 `execCommand` 默认复制可能漏报。
- 为避免重复执行用户代码，不确认未知自定义 `toString`、非标准数组迭代或数组元素访问器的载荷；缺少原生 `ClipboardItem` 检查接口时，`write()` 不确认。绕过临时包装直接调用原生 DataTransfer 方法时，载荷变化无法可靠判定。
- 第三方在异步调用栈退出后另行执行 `execCommand` 可能出现双提示，组件不为此抑制正常的连续复制。

宿主复制按钮已有一处就地标签反馈（按钮文字短暂变为「已复制」，写入失败时不提示），本组件与之叠加；只保留其一时，在 Plugin Manager 关闭本组件行即可。宿主不提供剪切确认，剪切提示无重叠。

## 安装

组件以裸包名引用，靠 `file:` 依赖和 `npm install` 生成的 `node_modules` 符号链接解析，clone 后必须先在聚合包目录（本目录）安装依赖：

```bash
npm install
```

然后二选一安装：

- 命令行：`dsh plugin --profile desktop add link:<本目录绝对路径>`
- Desktop 应用：「设置 → 插件 → 添加插件」，填入本目录绝对路径，安装完成后点击「立即启用」。

启用后刷新即可生效。在 Plugin Manager 里按组件行独立开关，停用某行即完全卸载该组件。

## 新增组件

1. 在 `packages/` 下新建组件包：`package.json`（`name` 为组件名、`dsh.client.platform: "web"`、`exports["./client"]`）、`lib/index.js`（宿主半边）、`lib/client.js`（浏览器半边）。
2. 在聚合包 `package.json` 的 `dependencies` 中加入 `"<组件名>": "file:packages/<组件名>"`，然后执行一次 `npm install`。
3. 在 `cordis.patch.yml` 的 insert 列表中加入一行 `{id: <组件名>, name: <组件名>}`；可添加 `config:` 字段，每行配置互相独立。
4. 重启应用生效。

## 结构注意事项

以下约束均来自 DSH 运行时代码，违反会导致组件加载失败或静默消失：

- 浏览器模块 `id` 恒等于组件包名：`lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 `id` 必须与组件包 `package.json` 的 `name` 完全一致，否则脚本虽执行但模块注册不上。
- 一个包只注册一个浏览器模块节点；一个包要贡献多个 UI 片段时，在它唯一的 `apply(ctx)` 里注册多次（如多个 slot）。
- `cordis.patch.yml` 每行的 `id` 是配置树的寻址键，全局唯一即可，不必等于包名（建议一致，便于对照）；修改 `id` 后，Plugin Manager 里按旧 `id` 记录的开关和配置覆盖会失配。
- 组件行的显示名优先读组件包 `locale/<语言>.json` 顶层 `meta` 键下的 `title` / `description`，没有语言文件则回退到 `package.json` 的 `name` / `description`。加语言文件时 `en.json` 必须存在，且组件包 `exports` 要包含 `"./locale/*.json"` 映射，否则 meta 读取被静默跳过。
- 行的 `name` 写裸包名，必须能解析（依赖 `file:` 符号链接，因此 clone 后先 `npm install`）。相对路径形式（如 `./packages/foo/lib/index.js`）也能工作，但读不到包 meta，Plugin Manager 里组件标题会显示成一串 file URL，不推荐。
- 聚合包的 `lib/index.js` 不会被 import，仅为满足包解析规范而存在，保持空实现即可。
- 修改聚合包的 `cordis.patch.yml` 不会热重载：需重启应用，或在 Plugin Manager 里切换一次任意组件开关触发全量重读。
- patch 文件语法错误会让整个聚合包静默消失（记入 skippedBundles）；修改后组件没有出现，先检查 YAML 语法。
- 组件需要宿主侧能力时，在组件包 `lib/index.js` 的 `apply(ctx)` 里消费或提供服务，不要把宿主代码放进聚合包。

## 调参

- `packages/dsh-click-spark/lib/client.js` 顶部的 `PRESET`：弹簧参数、短线数量与尺寸；`sparkColor` 设为 `"#rrggbb"` 使用固定颜色。
- `packages/dsh-copy-toast/lib/client.js` 顶部的 `TOAST`：`duration`（停留 ms）、`maxVisible`、`stackOffset` / `stackScale` / `stackGap`（堆叠几何），以及 `entrance` / `snapBack` / `wobble` / `slot` / `icon` 五组 `{stiffness, damping}`；紧邻的 `CSS` 常量控制外观。
- `packages/dsh-smooth-caret/lib/client.js` 顶部的 `MOTION`：`omega`（临界阻尼响应速度）、`trailMs` / `trailPoints`（拖尾时间与容量）、`settle`（停止阈值）；常用外观选项直接在「设置 → Vivid Motion」调整。
- `dsh-reasoning-slider` 的尺寸与过渡位于组件 `lib/client.js` 的 `CSS` 常量；以冻结的 `tests/reasoning-visual.html` 为参考。

DSH `0.2.0-rc.2` 的 `client-hmr` 默认每 500 ms 检查已加载组件文件的修改时间、创建时间和大小；检测到变化会生成新的资源版本并通知前端替换模块。前端资源虽然长期缓存，但 URL 携带版本，因此开关组件或修改包版本号不是刷新代码的可靠判据。排查更新时应比对正在运行的宿主提供的脚本与本地文件；若热更新连接异常，再重启应用。修改 bundle 挂载声明仍需按前述规则重读配置。本仓库没有额外的 TypeScript / Vite 构建步骤，也不要另起 Web 服务器代替正在使用的 GUI。

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
packages/dsh-smooth-caret/         组件包：平滑输入光标
  package.json                     组件清单：dsh.client.platform = web, immediately = true
  lib/index.js                     宿主半边（空实现）
  lib/client.js                    浏览器半边：活动端点测量 + 裁剪动效 + Vivid Motion 设置栏目
  locale/en.json, locale/zh.json   Plugin Manager 的组件名 dsh-smooth-caret 与中英文说明
packages/dsh-reasoning-slider/    组件包：直接复用冻结 HTML 的模型与推理滑块
  package.json                     组件清单：dsh.client.platform = web, immediately = true
  lib/index.js                     宿主半边（空实现）
  lib/client.js                    宿主目录接入、模型菜单、滑块与可卸载动效
  locale/en.json, locale/zh.json   Plugin Manager 的中英文组件说明
```
