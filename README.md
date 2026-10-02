# dsh-vivid-motion

DSH Web 界面动效**聚合包**（空壳 bundle）：自身不含功能代码，通过 `cordis.patch.yml` 把 `packages/` 下的组件包挂进配置树。结构与官方 `dsh-experimental-agent-team-profile` 相同——一个插件、多个可独立开关的组件，每个组件有自己的名字。

## 组件

| 组件 | 包 | 效果 |
| --- | --- | --- |
| dsh-click-spark | `packages/dsh-click-spark` | 鼠标点击粒子动效：在指针落点甩出一圈放射状短线，「干脆」预设——临界阻尼弹簧位移曲线，冲出去就停，不回弹、不旋转、不拖尾 |

### dsh-click-spark

| | |
| --- | --- |
| 触发 | 主键按下（`pointerdown`，捕获阶段，`passive`） |
| 形状 | 以指针为圆心严格均分 8 条短线，不旋转、不抖动 |
| 位移 | 阻尼弹簧解析解，`stiffness 620 / damping 50 / mass 1` → ζ ≈ 1.004 |
| 时长 | 300 ms（线尾同时用 ease-out 收到 0 长） |
| 颜色 | 跟随主题 `--dsw-alias-label-primary` |

「干脆」的全部参数取自 ClickSpark 参数调试台该预设的原始数值：

```js
{ stiffness: 620, damping: 50, mass: 1, duration: 300,
  sparkCount: 8, sparkRadius: 15, sparkSize: 10, extraScale: 1, sparkColor: null }
```

## 安装

clone 后在聚合包目录（本目录）先安装一次依赖——组件以裸包名引用，靠 `file:` 依赖生成的 `node_modules` 符号链接解析：

```
npm install
```

然后本地安装（本仓库目录即包目录）：

```
dsh plugin --profile desktop add link:D:\Code\dsh\plugins\dsh-vivid-motion
```

或在 Desktop 应用里：**设置 → 插件 → 添加插件**，填入本目录绝对路径，安装完点 **立即启用**。

启用后无需刷新以外的额外步骤；在 Plugin Manager 里可以按组件（行）独立开关，停用某行即完全卸载该组件。

## 实现要点

聚合包自身只有空的 `lib/index.js`；全部行为在各组件包内。以 `dsh-click-spark` 为例，它是**纯浏览器组件**：`lib/index.js` 的宿主半边只有空的 `apply()`，全部行为在 `lib/client.js`。

- **挂载位置**：canvas 直接挂在 `document.body` 上，`position:fixed; inset:0`、`z-index` 极高、`pointer-events:none`。这样它盖在 shell 的 `[data-shell-overlay]`（z-index 20）之上，又不受 app frame 的 `overflow:hidden` 裁剪，同时绝不拦截任何点击。
- **零帧开销**：只有存在存活动效时才 `requestAnimationFrame`；最后一圈结束后循环自动停下，空闲页面不排帧。多个元素各自独立推进，不会互相改写。
- **Spring 是解析解**：直接从时间 `t` 求值，不做逐帧积分，所以既没有累积漂移，也不需要每帧重建状态。
- **主题跟随**：描边色读一次 `--dsw-alias-label-primary` 后缓存（避免每次点击触发样式重算），`MutationObserver` 监听 `body[data-ds-dark-theme]` 变化时失效。
- **无障碍**：`prefers-reduced-motion: reduce` 时直接不触发。
- **生命周期**：整个挂载是一个 `ctx.effect`——停用该行会一并撤掉 canvas、全部监听器和 observer。

## 新增组件

1. 在 `packages/` 下新建组件包：`package.json`（`name: <组件名>`、`dsh.client.platform: "web"`、`exports["./client"]`）+ `lib/index.js`（宿主半边）+ `lib/client.js`（浏览器半边）。
2. 聚合包 `package.json` 的 `dependencies` 加 `"<组件名>": "file:packages/<组件名>"`，跑一次 `npm install`。
3. `cordis.patch.yml` 的 insert 列表加一行 `{id: <组件名>, name: <组件名>}`（可加 `config:` 字段，每行配置互相独立）。
4. 重启 app 生效。

## 结构注意事项

以下约束均来自 DSH 运行时代码，违反会导致组件加载失败或静默消失：

- **浏览器模块 id 恒等于组件包名**：`lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 `id` 必须与组件包 `package.json` 的 `name` 完全一致。boot graph 按包名查找 factory，对不上则脚本执行了但模块注册不上。
- **一个包 = 一个浏览器模块节点**：同一个组件包不能靠多次 `__ModuleLoader__.load` 注册出多个组件。若一个包要贡献多个 UI 片段，在它唯一的 `apply(ctx)` 里注册多次（如多个 slot）。
- **行 id 全局唯一、可自由命名**：`cordis.patch.yml` 里每行的 `id` 是配置树的寻址键，只要求整棵树内唯一，不必等于包名（但建议一致，少一层心智负担）。改 id 后，Plugin Manager 里按旧 id 记录的开关/配置覆盖会失配（残留行无害，但禁用状态不迁移）。
- **组件行的显示名来自组件包的 meta**：优先读组件包 `locale/<语言>.json` 顶层 `meta` 键下的 `title`/`description`，没有语言文件则回退到 `package.json` 的 `name`/`description`。加语言文件时 `en.json` 必须存在，且组件包 `exports` 要包含 `"./locale/*.json"` 映射，否则 meta 读取被静默跳过。
- **组件必须以裸包名可解析**：行的 `name` 写裸包名、靠聚合包 `file:` 依赖 + `npm install` 产生的 `node_modules` 符号链接解析——所以 clone 后必须先 `npm install`。`name` 也支持相对路径（如 `./packages/foo/lib/index.js`，指到文件），功能正常，但路径形式的 specifier 读不到包 meta，Plugin Manager 里组件标题会显示成一串 file URL，不推荐。
- **聚合包的 `lib/index.js` 不会被 import**：运行时只 import 各行的 `name`，聚合包入口仅为满足包解析规范而存在，保持空实现即可。
- **改 bundle 的 `cordis.patch.yml` 不会热重载**：HMR 只监听 profile 层和 `$DSH_HOME` 层的 patch 文件。改完需重启 app，或在 Plugin Manager 里切换一次任意组件的开关（会触发全量重读）。
- **patch 语法错误 = 整个 bundle 静默消失**：patch 文件解析失败时该 bundle 层被整体跳过（记录在 skippedBundles），插件从配置树消失而不报错。改完组件没出现，先检查 YAML 语法。
- **组件需要 Host 侧能力时**：在组件包的 `lib/index.js` 的 `apply(ctx)` 里消费/提供服务，浏览器侧通过组件包自己的 client 模块与之配合；不要把 Host 代码放进聚合包。

## 调参

改 `packages/dsh-click-spark/lib/client.js` 顶部的 `PRESET`（数值含义与原调试台一致），或把 `sparkColor` 设成 `"#rrggbb"` 固定颜色。改完重启/重新启用该行即可生效。

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
```
