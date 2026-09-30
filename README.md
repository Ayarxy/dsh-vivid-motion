# dsh-vivid-motion

DSH Web 界面上的鼠标点击粒子动效：在指针落点甩出一圈放射状短线，**「干脆」预设**——用临界阻尼弹簧做位移曲线，冲出去就停，不回弹、不旋转、不拖尾。

## 效果

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

本地插件（本仓库目录即包目录）：

```
dsh plugin --profile desktop add link:D:\Code\dsh\plugins\dsh-vivid-motion
```

或在 Desktop 应用里：**设置 → 插件 → 添加插件**，填入本目录绝对路径，安装完点 **立即启用**。

启用后无需刷新以外的额外步骤；停用该行即完全卸载画布、监听与 observer。

## 实现要点

包是**纯浏览器插件**：`lib/index.js` 的宿主半边只有空的 `apply()`，全部行为在 `lib/client.js`。

- **挂载位置**：canvas 直接挂在 `document.body` 上，`position:fixed; inset:0`、`z-index` 极高、`pointer-events:none`。这样它盖在 shell 的 `[data-shell-overlay]`（z-index 20）之上，又不受 app frame 的 `overflow:hidden` 裁剪，同时绝不拦截任何点击。
- **零帧开销**：只有存在存活动效时才 `requestAnimationFrame`；最后一圈结束后循环自动停下，空闲页面不排帧。多个元素各自独立推进，不会互相改写。
- **Spring 是解析解**：直接从时间 `t` 求值，不做逐帧积分，所以既没有累积漂移，也不需要每帧重建状态。
- **主题跟随**：描边色读一次 `--dsw-alias-label-primary` 后缓存（避免每次点击触发样式重算），`MutationObserver` 监听 `body[data-ds-dark-theme]` 变化时失效。
- **无障碍**：`prefers-reduced-motion: reduce` 时直接不触发。
- **生命周期**：整个挂载是一个 `ctx.effect`——停用该行会一并撤掉 canvas、全部监听器和 observer。

## 调参

改 `lib/client.js` 顶部的 `PRESET`（数值含义与原调试台一致），或把 `sparkColor` 设成 `"#rrggbb"` 固定颜色。改完重新构建/重启该行即可生效。

## 目录

```
package.json        包清单：dsh.bundle.patch + dsh.client.platform = web
cordis.patch.yml    bundle 挂载声明（向 Web profile 配置树插入本行）
lib/index.js        宿主半边（空实现，仅供 loader 解析）
lib/client.js       浏览器半边：canvas 覆盖层 + 弹簧动画
```
