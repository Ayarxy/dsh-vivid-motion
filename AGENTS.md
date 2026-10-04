# 开发约定

适用于整个仓库。修改前阅读本文件与 README.md。

## 文案

中文文档、产品和界面文案使用 [tech-doc-style-chinese](https://github.com/Fenng/Tech-Doc-Style-Chinese/blob/main/SKILL.md)，先读取 skill 及适用参考。保留事实、条件、限制和机器可读内容；用「」引号，中西文之间留空格，一段一行。

## 工作边界

- 按任务范围修改；处理 `dsh-reasoning-slider` 时，不顺带重写聚合包或其他组件。
- 自行测试，不启动、操作或重启 DSH，不发送聊天消息，不修改宿主安装文件；遵守会话中的浏览器访问与协议限制。
- 无额外 TypeScript / Vite 构建步骤；不要另起 Web 服务器代替 GUI。

## 组件开发

1. 在 `packages/` 新建组件包：声明包名、`dsh.client.platform: "web"`、`exports["./client"]`，提供 `lib/index.js` 与 `lib/client.js`。
2. 在聚合包 `dependencies` 中加入 `"<组件名>": "file:packages/<组件名>"`。
3. 在聚合包目录执行 `npm install`。
4. 在 `cordis.patch.yml` 的 insert 列表加入 `{id: <组件名>, name: <组件名>}`，按需添加独立的 `config:`。

- 聚合包入口保持空实现，宿主能力放在组件的 `lib/index.js`，浏览器功能放在 `lib/client.js`。
- 每包只注册一个浏览器模块，`__ModuleLoader__.load({ id })` 的 `id` 必须等于包名；多个 UI 片段在同一 `apply(ctx)` 中注册。
- patch 的 `id` 须全局唯一，建议与包名一致；改动会使旧开关和配置覆盖失配。`name` 用裸包名，由 `file:` 链接解析；路径引用读不到包 meta。
- 组件显示名读取 `locale/<语言>.json` 的 `meta.title` / `meta.description`，缺失时回退到包名与描述。添加语言文件须提供 `en.json` 和 `exports["./locale/*.json"]` 映射，否则 meta 被跳过。
- YAML 语法错误会使整个聚合包被跳过。挂载声明不热重载，重读需重启应用或切换任意组件开关；执行时遵守工作边界。
- 点击粒子、复制提示、光标的参数分别位于组件 `lib/client.js` 的 `PRESET`、`TOAST` / `CSS`、`MOTION`。

## 滑块维护

`packages/dsh-reasoning-slider/lib/client.js` 是生成文件，禁止手改。参考 `tests/reasoning-visual.html` 保持冻结，SHA-256 为 `bc6d51e80ab18dd1f41229d9007e118eb55ca6357d3c2bedb136f20eb0591e28`。宿主适配写在组件 `scripts/host-adapter.mjs`，再生成并核验：

```bash
node packages/dsh-reasoning-slider/scripts/sync-reference.mjs
node packages/dsh-reasoning-slider/scripts/sync-reference.mjs --check
```

- 保留参考滑块、CSS、着色器、运动函数及呈现依赖，不改动几何、时长与弹簧参数；宿主适配不属于逐字复用。运行时不读取测试文件。
- 使用宿主 React；通过 `modelDirectories.directoryFor(sessionId)` 获取模型目录，用 `directory.select(selection)` 提交选择。保留真实模型、供应商与档位 ID；不接入演示标题、调试按钮、展示舞台或模拟目录。
- 插槽作用域注入 `slots`、`modelDirectories`、`sessions`、`remote`、`remote.session`；缺少命名空间会使新会话入口失败。服务就绪与卸载恢复使用 Cordis 生命周期，不依赖预热或反复注册。
- `conversation.input.model` 是单入口插槽，优先级须唯一（可用 `-20`）；停用恢复原生入口。
- 保留参考调色板、字体和 `body.dark` 条件；不将 `--surface` 映射为宿主背景。样式仅作用于入口与弹窗；局部恢复 `corner-shape:round`，用 `overflow:clip` 隔离粒子，保留列表和长错误信息的内部滚动。
- 最高档按模型目录判断，输入栏与弹窗共用 `--rs-purple`；失败回退同步恢复颜色。按钮保持「模型名 + 推理强度」，列表不添加默认或推荐模型集、顶部返回按钮或「选择模型」标题行。
- 拖动预览，松手提交；首请求立即发送，后续按序仅发送最新待发档位，不加防抖、不并发、不绕过宿主验证。中间回执不覆盖最新位置，失败回到宿主确认的值；停用、锁定或切换会话时丢弃旧队列。
- 等待期间允许同一模型继续调档和查看列表，禁止模型选择（包括在搜索框中按 Enter）。保留箭头 SVG 节点、可导航标题、`aria-busy` 与错误播报；没有搜索框且所有模型选项禁用时，聚焦弹窗，Escape / Tab 可退出。处理取消、键盘、滚轮、减少动态效果与卸载清理。

## 验证

回归测试脚本、冻结参考和必要夹具放在 `tests/`，纳入 Git，不随组件分发。截图、日志、缓存和临时结果统一放在 `tests/artifacts/`，由 Git 忽略；已有的 `tests/npm-cache/` 和各级 `node_modules/` 也由 Git 忽略。

滑块使用以下脚本，旧脚本不作为当前版本的验证结论：

```bash
node tests/reasoning-exact-reference.mjs
node tests/reasoning-popup-motion.mjs
node tests/reasoning-exact-host.mjs
node tests/reasoning-session-lifecycle.mjs
```

分别覆盖参考一致性与清理、弹窗动效、宿主选择与闪烁、会话生命周期。生命周期测试直接加载生成入口，以真实 Cordis `Service` 和独立 `remote.session` 验证依赖，不临时替换声明。

运行这些测试前，需在 `tests/reasoning-runtime/node_modules/` 准备测试依赖。宿主选择与会话生命周期测试还依赖 `.scratch/reasoning-host-seed.mjs` 和脚本中指定的本地 DSH 静态资源目录；这些环境产物不随 Git 提交，新克隆仓库后需单独准备。上述四个测试离线执行，不连接运行中的 DSH。

DSH `0.2.0-rc.2` 的 `client-hmr` 默认每 500 ms 检查组件文件的修改时间、创建时间和大小，并更新资源版本。确认加载版本须比对宿主提供的脚本与本地文件；组件开关或包版本变化不足以证明更新。

只报告实际执行的检查。JSDOM、模拟 WebGL 与合成输入事件不能证明实际像素、GPU、滚动几何或输入法效果；这些效果与当前版本的宿主加载状态仍待确认。
