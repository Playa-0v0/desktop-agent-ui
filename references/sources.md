# 技术依据与适用边界

标准与官方文档用于核实机制；本仓库的布局、阈值和流程建议是工程经验，不因此成为行业统一规范。核对日期：2026-10-23。支持情况以项目实际运行时为准。

## 可核查来源

| 编号 | 来源 | 支持的结论与限制 |
| --- | --- | --- |
| S1 | [Chrome：滚动驱动动画](https://developer.chrome.com/blog/new-in-web-ui-io-2024#performance-benefits-of-scroll-driven-animations) | 可减少滚动监听；脱离主线程依赖动画属性是否可合成，不能推出零 CPU 或无卡顿 |
| S2 | [W3C：注册自定义属性](https://www.w3.org/TR/css-properties-values-api-1/#calculation-of-computed-values) | 注册语法决定计算值类型；长度与百分比不能随意混用 |
| S3 | [W3C：组合输入事件](https://www.w3.org/TR/uievents/#events-compositionevents) | 组合事件与按键状态的语义；输入法和平台差异仍需实测，不规定通用 500 毫秒窗口 |
| S4 | [W3C：盒阴影模糊](https://www.w3.org/TR/css-backgrounds-3/#shadow-blur) | 盒阴影模糊半径约为两倍标准差；精确模糊算法并未固定 |
| S5 | [W3C：滤镜投影](https://www.w3.org/TR/filter-effects-1/#funcdef-filter-drop-shadow) | `drop-shadow()` 的第三个长度为标准差，投影基于透明度轮廓 |
| S6 | [Chrome：内容驱动的表单尺寸](https://developer.chrome.com/blog/new-in-web-ui-io-2024#field-sizing_content) | `field-sizing: content` 可随内容改变尺寸；需要设置尺寸约束并核实运行时支持 |
| S7 | [Electron：自定义窗口交互](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) | 拖拽区会忽略指针事件，可交互控件应设为非拖拽区 |

这些来源说明技术机制，不替本仓库的示例、审计脚本或产品选择背书。[Open Claude UI](https://github.com/Caho1/open-claude-ui) 与 [REA](https://github.com/morluto/rea) 是设计研究线索，不能替代目标版本源码、许可证与运行结果的核实。

## 机制索引

| 编号 | 机制 | 适用边界与依据 |
| --- | --- | --- |
| ENG-01 | 阴影与祖先裁切 | 内外分层是常用解法；模糊外扩仅估算，见 S4、S5 和 [经验指南](desktop-pitfalls.md) |
| ENG-02 | 动效中间帧遮罩 | 先确认硬切是否非预期；渐变可能改善效果，也会增加绘制与可读性成本 |
| ENG-03 | 圆角裁切 | 需要圆角的 `inset()` 可显式写 `round`；矩形测量不能验证角部像素 |
| ENG-04 | 滚动槽位 | 优先沿用组件库补偿；确认实际滚动容器，避免重复补偿 |
| ENG-05 | 输入框尺寸 | 优先组件库或内置能力；尺寸观察器不能单独替代内容高度计算，见 S6 |
| ENG-06 | 滚动条外观 | 沿用平台或产品习惯；隐藏为可选项，需要发现性与可访问性验证 |
| ENG-07 | 输入法发送 | 组合事件基线及实例隔离；兼容分支先提供平台事件序列，见 S3 |
| ENG-08 | 分栏取消 | 复用分栏库，恢复拖拽前完整状态；吸附比例由内容与窗口决定 |
| ENG-09 | 滚动动效 | 检测特性与性能，保留可读回退；见 S1、S2 |
| ENG-10 | 多窗口一致性 | 沿用持久化与通信方案；权威节点生命周期、原子版本校验与重连策略需明确 |
| ENG-11 | 阅读意图与跟随 | 在内容改变前记录跟随意图；避免追加后离底距离误判用户操作 |
| ENG-12 | 用户控制权 | 状态可见、可解释、可介入、可停止与可追溯，是本仓库的产品检查维度 |
| ENG-13 | 过程与产物分层 | 先区分语义；是否独立面板按任务与空间决定 |
| ENG-14 | 裁切诊断 | [脚本](../scripts/clip-audit.js) 为估算工具；需结合视觉和交互证据，见 [验收](acceptance.md) |

## 维护

新增经验注明触发条件、目标运行时、证据和已知限制。不要把一次修复的常量推广为强制规则；更新示例或诊断逻辑时同步运行对应回归。
