# dsh-vivid-motion

DSH Web 界面动效聚合包（空壳 bundle）：自身不含功能代码，通过 `cordis.patch.yml` 把 `packages/` 下的组件包挂进配置树，每个组件在 Plugin Manager 里独立成行、独立开关。结构与官方 `dsh-experimental-agent-team-profile` 相同，可直接安装使用，也可作为新增动效组件的模板。

## 组件

| 组件 | 效果 |
| --- | --- |
| dsh-click-spark | 点击粒子动效：指针落点甩出 8 条放射状短线，临界阻尼弹簧位移（`stiffness 620 / damping 50 / mass 1`），300 ms 结束，不回弹、不旋转、不拖尾；颜色跟随主题 token |
| dsh-copy-toast | 剪贴板确认 toast：复制或剪切成功时在底部居中弹出「已复制」/「已剪切」（英文 Copied / Cut）；果冻弹簧入场，最多堆叠 4 枚，悬停暂停倒计时，停留 2000 ms，可按住左右拖动超过 64 px 丢弃 |

两个组件都是纯浏览器组件：宿主侧 `lib/index.js` 为空实现，全部行为在 `lib/client.js`，通过 `ctx.effect` 或插槽注册挂载，停用对应组件行即完全卸载。配色只引用 `--dsw-*` 主题 token；文案通过 Client 的 `locale` 服务注册，该服务缺席时按 `<html lang>` 回退。`prefers-reduced-motion: reduce` 时，dsh-click-spark 不触发，dsh-copy-toast 动画压到 1 ms。

### dsh-copy-toast 的确认逻辑

同时观察两条通路，仅在写入成功且载荷非空时确认：

1. 可信的 DOM `copy` / `cut` 事件：捕获阶段挂在 `document` 上，覆盖快捷键、右键菜单，以及宿主在异步 API 缺失时使用的 `execCommand("copy")` 兜底路径；脚本派发的合成事件不确认。
2. 包装 `navigator.clipboard.writeText` / `.write`：原生异步 API 不触发 `copy` 事件，逐方法包装实际持有该函数的对象，保留原参数、`this`、返回值与异常语义；提示自身出错不影响复制结果，API 拒绝时不确认。

其他规则：

- 剪切要求选区可编辑且原文确实被删除，覆盖 DSH Lexical 编辑器自行处理剪切的路径；仅写入数据、只移动光标或塌陷选区不确认。
- 空选区、`writeText("")`、`write([])`、只读或禁用控件上的剪切均不确认；一次同步调用内的嵌套写入只确认一次，连续复制各自确认，不用时间窗口去重。
- 宿主在异步 API 拒绝时直接返回 `false`，不会再次执行 `execCommand`；`preventDefault()` 不一定代表失败，写入非空载荷后取消默认动作的复制仍会确认。

已知限制：

- iframe 内的事件不会冒泡到本页；DOM 事件没有系统剪贴板回执，无可读选区的 `execCommand` 默认复制可能漏报。
- 为避免重复执行用户代码，不确认未知自定义 `toString` 或非标准数组迭代的载荷；绕过临时包装直接调用原生 DataTransfer 方法时，载荷变化无法可靠判定。
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

client 模块会被浏览器缓存：修改 `lib/client.js` 后需重启 DSH 应用并重新加载页面才能生效，重复开关组件不能保证更新。本仓库没有额外的 TypeScript / Vite 构建步骤，也不要另起 Web 服务器代替正在使用的 GUI。

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
