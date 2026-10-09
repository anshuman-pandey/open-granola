<p align="center">
  <img src="../assets/logo.svg" width="72" alt="Open Granola 标志" />
</p>

<h1 align="center">Open Granola</h1>

<p align="center">
  <strong>本地转写，自由选择会议笔记使用的 AI。</strong><br/>
  基于 Tauri、React 和 Rust 构建，采用 Apache-2.0 许可证的桌面会议笔记本。
</p>

<p align="center">
  <a href="#try-the-preview">试用预览版</a> ·
  <a href="#models-and-connections">模型</a> ·
  <a href="../ARCHITECTURE.md">架构</a> ·
  <a href="../../PRIVACY.md">隐私</a> ·
  <a href="../COMPETITIVE_RESEARCH.md">调研与优先事项</a>
</p>

[English](../../README.md) · [हिन्दी](README.hi.md) · [Español](README.es.md) · [日本語](README.ja.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [语言支持](../I18N.md)

<!-- English source: README.md at a25a58aece9c5337340c352eb431b83a041d1d47; reviewed 2026-10-10. -->

**开发预览版。** Open Granola 录制麦克风音频，通过本地 Whisper 转写，再使用本地模型或你连接的提供方将转写文本整理成笔记。资料库保存在本地 SQLite 数据库中。使用云端摘要功能时，转写文本会发送给所选提供方。

系统音频录制尚未实现：此版本无法录制通话中通过耳机播放的对方声音。真实的麦克风和模型会话、提供方账户以及打包发行版，仍需在目标硬件上完成端到端测试。浏览器预览使用明确标注的示例会议。

<a id="what-is-implemented"></a>

## 已实现的功能

- **麦克风转写：** 本地 `whisper.cpp`、带时间戳的转写片段，以及可见的实时转写文本。
- **摘要提供方选择：** 内置 Qwen、LM Studio、OpenAI API、Claude API、自定义 OpenAI 兼容端点，以及实验性的 Sign in with ChatGPT。
- **连接测试：** 通过合成文本请求检查所选摘要模型，不发送会议内容。此测试不检查麦克风录制或 Whisper。
- **已保存会议的恢复：** 先保存转写文本，再生成摘要。摘要失败后可以重试，无需重新录制。重新生成笔记时，已有待办事项的 ID 和完成状态会保留。
- **处理详情：** 已保存的会议记录配置的模型／提供方路径和摘要状态，避免后续设置变更掩盖笔记的生成方式。
- **本地资料库：** 关键词搜索、基于检索文本的问答、待办事项、承诺事项、Markdown 配方、JSON 导入和 Markdown 导出。
- **保留期限控制：** 删除超过保留期限的会议，或清空本地资料库。有关限制，请参阅[隐私说明](../../PRIVACY.md)。

生成的笔记和承诺事项需要人工核查。说话人识别、语义／向量搜索、日历集成、从特定会议服务直接导入、加密音频回放，以及原生系统音频录制均尚未实现。

<a id="models-and-connections"></a>

## 模型与连接

转写和摘要承担不同的任务。**目前，无论选择哪个摘要提供方，录制都需要本地 Whisper。** 此版本不提供云端转写 API。

| 摘要路径 | 设置方式 | Open Granola 发送的内容 |
|---|---|---|
| 内置本地 Qwen | 安装 `qwen3-4b-q4.gguf` | 不向提供方发送请求 |
| LM Studio | 启动其 OpenAI 兼容服务器；使用 `http://127.0.0.1:1234/v1` 和已加载模型的 ID | 向此设备上的服务器发送文本 |
| OpenAI API | 你的 API 密钥和受支持的模型 ID | 向 OpenAI 发送文本；适用 API 计费 |
| Claude API | 你的 Anthropic API 密钥和模型 ID | 向 Anthropic 发送文本；适用 API 计费 |
| OpenAI 兼容服务 | 兼容的基础 URL、模型 ID 和可选密钥；例如本地 Ollama 服务器 | 向配置的服务器发送文本 |
| ChatGPT 套餐 — 实验性 | 选择 **Continue with ChatGPT（使用 ChatGPT 继续）**，授权符合条件的套餐用量，然后选择模型 | 通过已授权的套餐向 OpenAI 发送文本 |

ChatGPT 路径使用[面向开源／本地应用的官方登录流程](https://developers.openai.com/siwc/token-sharing-open-source)。它不会授予对现有 ChatGPT 对话的访问权限。使用资格和模型可用性取决于账户及提供方。此集成尚未使用真实账户完成端到端验证。这里支持文本请求；[该预览不支持音频转写](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

Claude 通过 API 密钥连接；本应用不提供 Claude 消费者账户登录。OpenAI API 密钥和 ChatGPT 套餐登录是两条独立路径。

<a id="connect-a-summarizer"></a>

### 连接摘要模型

设置指南：[LM Studio](../integrations/LM_STUDIO.md) · [Ollama](../integrations/OLLAMA.md)。

1. 在桌面应用中打开 **设置 → 模型与连接**。
2. 选择提供方，输入确切的模型 ID。如果使用自定义服务器，请输入其文档指定的 API 基础 URL。
3. 对于 ChatGPT，请连接账户并使用 **加载可用模型**，或输入账户支持的模型 ID。如果处理目标位于设备外部，请启用允许向其发送文本的设置。此授权也涵盖助手和配方使用的相关已保存笔记。
4. 保存设置，然后运行 **测试连接**。
5. 先录制一段简短的麦克风会话，检查转写文本和笔记，再进行较长的录制。

远程端点必须使用 HTTPS；未加密的 HTTP 仅允许用于 `127.0.0.1` 等字面量回环地址。LM Studio 请使用上文给出的字面量地址。自定义端点的兼容性需要测试：“OpenAI 兼容”标签并不保证所有端点都支持相同的请求字段。模型失败时，不会自动从本地处理切换到云端处理。

密钥由原生代码处理，并在可用时保存到操作系统的凭据存储中。如果凭据存储无法保存密钥，应用会仅在本次会话的内存中保留，并显示相应状态。凭据不会保存在会议数据库或浏览器存储中。本地运行的服务器本身可能转发请求；Open Granola 发送文本后会发生什么，取决于该服务器的配置。

<a id="try-the-preview"></a>

## 试用预览版

<a id="browser-workspace"></a>

### 浏览器工作区

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

浏览器工作区展示示例会议，不会录制音频、运行原生推理或保存提供方凭据。

<a id="desktop-development-build"></a>

### 桌面开发构建

安装 Rust **1.98 或更高版本**、Node **22.12 或更高版本**（推荐 Node 24 LTS）、CMake、libclang、C/C++ 编译器，以及 [Tauri 平台前置依赖](https://v2.tauri.app/start/prerequisites/)。Linux 还需要 ALSA、WebKitGTK 和已配置的 PipeWire 开发依赖。macOS 应用包面向 macOS 14.4 或更高版本。平台构建配置不代表已经完成硬件质量验证。

```sh
npm ci
npm run tauri dev
```

Tauri 钩子会在启动应用前构建本地推理辅助程序。生成发行包时运行：

```sh
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle`。签名、公证以及安装／升级测试是独立的发行工作。准备就绪后，可将已验证的产物发布到 [Releases](https://github.com/anshuman-pandey/open-granola/releases)；本 README 不承诺提供预编译安装程序。

<a id="install-local-models"></a>

### 安装本地模型

设置中会显示实际的模型目录：`<app-data>/library/models/`。

- 录制音频需要安装兼容的 Whisper 模型，并命名为 **`whisper-large-v3-turbo.bin`**。
- 仅在使用内置摘要模型时，才需要安装兼容的 GGUF 模型，并命名为 **`qwen3-4b-q4.gguf`**。
- 使用 LM Studio 或云端摘要模型时，仍然需要 Whisper，但不需要内置 Qwen 文件。

模型需要手动安装。应用不会替你下载、续传或校验发布者提供的校验和。请从可信的发布者获取模型，并检查其格式和许可证。文件缺失或无效时会显示设置错误。

<a id="how-a-meeting-is-processed"></a>

## 会议处理流程

```text
Microphone → local Whisper → saved local transcript
                                  ↓
                    selected local/server/cloud model
                                  ↓
                         notes, actions, commitments
```

流程为：麦克风 → 本地 Whisper → 已保存的本地转写文本 → 所选的本地／服务器／云端模型 → 笔记、待办事项和承诺事项。

笔记、转写文本和处理详情存储在本地，未实施应用级数据库加密。如果转写文本提交后摘要生成失败，可对已保存的会议重试。录制内容仍在内存中时发生的崩溃，无法通过此功能恢复。音频保留在 RAM 中，不会有意写入录音文件。

<a id="privacy-in-plain-terms"></a>

## 隐私说明

- 默认使用本地模型。设备外部的文本处理需要配置提供方并获得同意。
- 为支持提供方和 ChatGPT 登录，原生网络功能处于启用状态。此版本**并非由操作系统强制实施的网络隔离环境**。
- WebView 仅可访问随应用打包的资源和本地应用 IPC。提供方请求在原生代码中执行。
- 应用未实现遥测或 Open Granola 云同步服务。连接的提供方有各自的数据政策。
- 删除本地记录不会删除提供方持有的数据、导出文件、操作系统快照或备份。

有关存储、凭据、网络和删除的详情，请阅读 [PRIVACY.md](../../PRIVACY.md) 和 [SECURITY.md](../../SECURITY.md)。

<a id="next-priorities"></a>

## 后续优先事项

[竞品调研](../COMPETITIVE_RESEARCH.md)考察了十个大型相关仓库，以及七款更接近或相邻领域的产品。优先事项依据反复出现的用户问题确定，而非竞争产品 README 中的功能数量：

1. 使用真实模型和提供方账户，验证从全新安装到麦克风录制的完整流程；改善模型设置和打包。
2. 在明确的平台矩阵上实现并测试系统音频、设备切换、音频信号是否持续更新和长时间录制。
3. 将决策和待办事项关联到转写段落；在将 AI 推断视为已确认的承诺前，先进行核查。
4. 添加词汇纠正、显式语言选择，以及可恢复的长会议处理。
5. 在核心记录功能可靠后，探索选择性文本共享和限定范围的智能体访问。

这些均为计划中的能力。调研和自动化测试并不能证明应用适用于你的会议环境。

<a id="development-checks"></a>

## 开发检查

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

原生测试需要平台构建依赖。修改录制、凭据或数据处理之前，请阅读[架构文档](../ARCHITECTURE.md)、[安全政策](../../SECURITY.md)和[贡献指南](CONTRIBUTING.zh-CN.md)。

<a id="license"></a>

## 许可证

[Apache-2.0](../../LICENSE)。模型文件和第三方提供方有各自的许可证及条款。
