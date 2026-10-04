# dsh-vivid-motion

一个 DeepSeek Harness 插件，内含多个用于界面优化和动效的组件。各组件相互独立，用户可在插件详情页分别启用或禁用。

| 组件 | 功能 |
| --- | --- |
| dsh-click-spark | 放射状的点击粒子效果，颜色跟随主题 |
| dsh-copy-toast | 复制或剪切后显示确认提示，最多堆叠 4 枚 |
| dsh-smooth-caret | 平滑移动的光标；支持自定义颜色、粗细、开关闪烁和拖尾 |
| dsh-reasoning-slider | Codex风味的模型/推理强度滑块 |

## 安装

先在本目录安装依赖：

```bash
npm install
```

再任选一种方式安装：

- 命令行：`dsh plugin --profile desktop add link:<本目录绝对路径>`。
- Desktop 应用：「插件 → 添加插件」，输入插件的GitHub 仓库地址或本地目录路径。

启用后重启软件。

## 已知限制

- 开启系统的「减少动态效果」后，复制提示动画缩至 1 ms，光标恢复原生，滑块关闭过渡、缩放与粒子，WebGL 仅绘制静态帧。
- 剪贴板 DOM 事件没有系统回执，跨源或受沙箱限制的 iframe 内复制、无可读选区的默认复制可能漏报。未知自定义 `toString`、非标准数组迭代或元素访问器的载荷不确认；缺少原生 `ClipboardItem` 检查接口时，`write()` 不提示。绕过包装直接调用原生 DataTransfer 方法时，载荷变化无法可靠判定；第三方异步另行执行复制可能出现双提示。

开发与验证约定见 [AGENTS.md](AGENTS.md)。
