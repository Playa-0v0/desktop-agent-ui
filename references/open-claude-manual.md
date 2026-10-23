# 桌面参考实现手册导读与深度工程机制

本手册按基础界面与进阶工程两组组织参考主题；这是阅读分类，不代表行业统一的代际演进或本仓库已完成的生产验证。技术结论以标准、目标运行时和实际测量为准。

> [!TIP]
> **如何获取与复刻该设计系统**：
> 若用户明确希望为应用引入类似 Claude 桌面端的设计系统（Claude Design System），可直接前往上游获取完整资产：
> - **在线手册与组件预览**：[openclaudeui.com](https://openclaudeui.com/)
> - **上游仓库**：[`github.com/Caho1/open-claude-ui`](https://github.com/Caho1/open-claude-ui)（按目标版本核实可复用模块与授权）
> - **注意**：若项目已有成熟组件库（如 shadcn/ui），严禁强行替换，直接将本手册中的工程物理机制（如输入法守卫、CSS 滚动动效）迁移至现有组件中即可。

---

## 如何使用参考实现

上游资料可用于研究组件与布局。复用前核对目标版本、许可证和项目已有能力，不假定本仓库的主题分类代表上游版本或行业架构演进。

- 优先迁移可解释的交互机制，避免为接近某个产品外观替换整套组件。
- 将产品偏好与技术约束分开；下文示例可用于验证机制，实际接入仍须适配现有状态与组件。

---

## 深度工程机制与关键实现

### 1. CSS（层叠样式表）滚动驱动遮罩

先确认目标运行时支持 `animation-timeline`。浏览器内置滚动时间线可以减少手写滚动监听；能否在合成线程运行取决于动画属性和实现，不能据此承诺零 CPU 占用或零主线程耗时。遮罩属性变化仍可能带来绘制成本，需用实际长会话测量。依据见 [S1、S2](sources.md)。

下面是有上下边缘默认值、单位一致的最小示例。两端淡出长度是示例值；不支持时间线时保留可读内容，用户开启减弱动态效果时关闭动态遮罩。

```css
@property --agent-ui-fade-top {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
@property --agent-ui-fade-bottom {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
.scroll-container {
  max-height: 24rem;
  overflow: auto;
}
@supports (animation-timeline: scroll()) {
  .scroll-container {
    mask-image: linear-gradient(to bottom,
      transparent 0,
      black var(--agent-ui-fade-top),
      black calc(100% - var(--agent-ui-fade-bottom)),
      transparent 100%);
    animation: agent-ui-top linear both, agent-ui-bottom linear both;
    animation-timeline: scroll(self block), scroll(self block);
    animation-range: 0px 24px, calc(100% - 24px) 100%;
  }
}
@keyframes agent-ui-top {
  from { --agent-ui-fade-top: 0px; }
  to { --agent-ui-fade-top: 24px; }
}
@keyframes agent-ui-bottom {
  from { --agent-ui-fade-bottom: 24px; }
  to { --agent-ui-fade-bottom: 0px; }
}
@media (prefers-reduced-motion: reduce) {
  .scroll-container { animation: none; mask-image: none; }
}
```

只把遮罩用于允许渐隐的内容区域，避免遮住滚动条、焦点环或交互控件。无溢出内容、顶部、中间、底部和减弱动态效果均需验证。

### 2. 输入法安全发送：事件基线与兼容边界

优先沿用现有输入组件的输入法处理。新实现以 `compositionstart`、`compositionend` 和 `KeyboardEvent.isComposing` 为基线；不同系统、浏览器与输入法的事件序列需要实际记录，不能假定都会抛出同一种“伴生 Enter”。见 [S3](sources.md)。

以下工厂为每个输入框保存独立状态，支持普通 Enter（回车键）发送、Shift + Enter 换行。它不等待固定的 500 毫秒，因此组字结束后的独立发送不会被时间窗口吞掉。

```javascript
function createComposerHandlers(onSend) {
  let composing = false;
  return {
    compositionstart() { composing = true; },
    compositionend() { composing = false; },
    blur() { composing = false; },
    keydown(event) {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey ||
          event.metaKey || event.altKey || event.repeat || event.defaultPrevented) return;
      if (composing || event.isComposing) return;
      event.preventDefault();
      onSend();
    },
  };
}
```

将同一实例的三个事件处理器和 `blur` 绑定到同一个输入框，卸载时解除绑定。框架封装事件需读取对应的原生组合状态；发送快捷键沿用产品配置，示例不是统一默认值。

**已知边界**：这个基线不能宣称覆盖所有输入法。若某个目标平台在 `compositionend` 后才送出同一次确认键，且 `isComposing` 已为 false，需要依据真实事件日志，在该平台或组件中增加有针对性的兼容处理及回归用例；不能靠任意延时判断按键身份。合成事件测试不能代替真实输入法验收。

### 3. 分栏拖拽与取消

优先使用项目现有分栏库。最小宽度、是否吸附折叠、吸附阈值应根据内容与窗口尺寸确定；18%/82% 只是某种布局的示例，不是通用比例。

取消拖拽时恢复交互前的完整快照，包括比例与折叠状态，并释放指针捕获、清理监听。不要固定执行 `setIsRightCollapsed(false)`：拖拽前可能本来就是折叠状态。复核 Escape（退出键）、指针取消、窗口失焦和组件卸载，优先调用库提供的取消接口。

### 4. 多窗口一致性

先复用已有状态存储、持久化和进程通信方案。确定哪个生命周期稳定的服务拥有权威状态：可能是主进程、服务端或受控共享服务；不要默认让可随时关闭的主窗口承担权威职责。

多个窗口可订阅带版本的快照与增量事件。并发写入需要时，在权威写入端原子地校验预期版本并提交；冲突后重新读取并让用户处理。乐观并发控制不等于预先申领排他锁，单独比较一次哈希也不能避免检查与写入之间的竞争。窗口关闭、重连、事件缺口和重复请求必须有明确恢复方式。

---

## 可迁移的设计方法总结

1. **界面区域正交分工**：窗口外壳控制区、导航区、主会话区、执行过程区与产物工作台保持清晰的物理层级与滚动隔离。
2. **状态与事件严格对齐**：工具卡片（Tool Card）从调用发起、参数渲染、等待人工授权到执行结果，必须严格绑定单一的唯一调用 ID，禁止凭定时器推进状态。
3. **滚动服从阅读意向**：新内容追加或折叠面板展开时，计算用户视口位置；用户向上翻阅时冻结自动滚动，回到底部时自动恢复跟随。
4. **统一设计令牌（Design Tokens）先行**：在具体组件编写前，确立语义化 Surface、文本阶梯、圆角与间距规范，阻断均值收敛导致的千篇一律。
