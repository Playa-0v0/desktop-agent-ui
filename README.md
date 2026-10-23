# Desktop Agent UI

> 现代桌面 Agent / AI 应用的设计规范、交互物理学与深度工程实践指南。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Skill: Agent UI](https://img.shields.io/badge/Skill-Desktop%20Agent%20UI-emerald.svg)](SKILL.md)

---

## 📖 项目简介

**Desktop Agent UI** 是一套专为现代桌面 AI / Agent 应用打造的设计系统与工程避坑规范。

在长会话、异步工具调用和多面板场景中，本项目提供状态、输入、滚动、窗口与裁切问题的排查参考。它不预设组件库，也不把特定产品的尺寸和布局当成通用标准。技术依据与经验边界见 [来源索引](references/sources.md)。

---

## ⚡ 核心内容

1. **真实状态与控制权**：区分受理、执行、停止请求、确认停止、预览和已保存，按真实事件呈现。
2. **输入法安全发送**：提供实例隔离的组合事件基线；平台差异依据实际事件日志处理，不用固定时间窗口猜测按键身份。
3. **滚动与输入尺寸**：优先复用组件库与浏览器内置能力，按用户阅读意图跟随，避免双重补偿。
4. **裁切诊断**：内置 [`scripts/clip-audit.js`](scripts/clip-audit.js)，定位矩形边界附近的潜在阴影裁切，明确返回复杂形状待复核项；诊断不能单独作为通过证明。
5. **可适配的桌面方案**：分栏吸附、独立面板、滚动条外观和多窗口架构按任务选择。
6. **可验证示例**：包含滚动遮罩与输入法基线，并用浏览器回归检查；不承诺纯 CSS 零 CPU 或无卡顿。

---

## 💡 设计系统与技术栈边界（Framework & Design System Agnostic）

- **不强制绑定特定组件库**：本 Skill **不设定、不限定任何特定 UI 库**（无论你的项目使用 `shadcn/ui`、`Ant Design`、`Radix UI`、`Tailwind CSS` 还是原生自绘，可结合实际平台和组件行为选择相关建议）；
- **不包含预制代码模板**：本 Skill **不包含任何预制的设计系统模板或样式代码包**。它的核心定位是桌面 Agent 场景下的**底层交互物理学、状态机设计原则、输入法防误触与按改动选择的诊断与验收**；
- **Agent 执行决策流**：
  1. **已有项目**：Agent 优先自动检测项目环境，**严格沿用项目既有的成熟设计系统与组件库**，严禁引入重复依赖；
  2. **从零起步**：若未检测到既定设计系统，Agent 依据任务做最小方案，只有方向或大型依赖会实质影响结果时才询问；
  3. **若需使用 Claude 设计系统风格**：若你希望复用或参考 Claude 的桌面设计系统（Claude Design System），可直接前往上游 [Open Claude UI](https://github.com/Caho1/open-claude-ui) 与 [在线文档](https://openclaudeui.com/) 获取其完整的 Design Tokens 与组件源码。

---

## 📂 仓库结构

```text
desktop-agent-ui/
├── SKILL.md                          # Skill 入口定义与推荐工作流
├── README.md                         # 仓库介绍与使用说明
├── LICENSE                           # MIT 开源协议
├── references/
│   ├── open-claude-manual.md         # 现代桌面体系导读与核心工程机制
│   ├── desktop-pitfalls.md           # 桌面工程避坑指南（阴影、IME、焦点、滚动跳动）
│   ├── agent-interaction.md          # Agent 交互结构、生命周期与用户控制权
│   ├── components-motion.md          # 核心组件实现、自适应高度配方与动效物理学
│   ├── acceptance.md                 # 质量验收清单与 clip-audit 审计指南
│   └── sources.md                    # 架构分类与技术参考索引（ENG-01 ~ ENG-14）
├── scripts/
│   └── clip-audit.js                 # 当前状态的阴影裁切诊断脚本
├── tests/browser.test.cjs            # 浏览器回归与文档示例验证
└── package.json                      # 仅开发验证依赖
```

---

## 🚀 使用方法

### 作为 Agent Skill 使用
将本仓库放置或链接至你的 Agent 技能目录（如 `~/.agents/skills/desktop-agent-ui` 或 `~/.gemini/antigravity-cli/skills/desktop-agent-ui`），Agent 可在匹配任务时选择该技能；具体发现与调用方式取决于宿主工具。

### 运行阴影裁切诊断
在浏览器控制台或页面求值接口中运行内置的 [`scripts/clip-audit.js`](scripts/clip-audit.js)：
```javascript
// 将 CSS 视口边界加入当前状态诊断
const audit = (/* 将 clip-audit.js 内容粘贴于此 */);
const result = audit({ viewport: true, tol: 1 });
console.log(result); // 检查 issues、warnings 与 truncated，再结合真实画面判断
```

---

## 验证示例与脚本

```sh
npm ci
npx playwright install chromium
npm test
```

测试仅需开发依赖，诊断脚本本身不引入第三方运行依赖。结果字段与范围见 [验收清单](references/acceptance.md)。合成事件不替代真实输入法，浏览器回归不替代原生窗口验收。

---

## 🙏 致谢（Acknowledgments）

本项目深度参考、吸收并致敬以下优秀的上游开源工作与技术成果：

1. [**Open Claude UI 手册** (`Caho1/open-claude-ui`)](https://github.com/Caho1/open-claude-ui)（在线文档：[openclaudeui.com](https://openclaudeui.com/)）：感谢上游手册项目对现代桌面级 Agent 客户端界面拓扑、设计令牌体系、原子控件与架构细节的系统性拆解与开创性整理；
2. [**REA（Reverse Engineered Artifacts）仓库** (`morluto/rea`)](https://github.com/morluto/rea)：感谢 REA 项目提供的底层精度审计、深入逆向洞察与生产级架构参考实现支持；
3. 感谢社区相关桌面设计规范与动效物理学 Skill 的启发与贡献。

---

## 📄 开源许可证

本项目采用 [MIT 许可证](LICENSE)。
