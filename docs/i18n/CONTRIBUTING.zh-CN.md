# 为 Open Granola 贡献

[English](../../CONTRIBUTING.md) · [हिन्दी](CONTRIBUTING.hi.md) · [Español](CONTRIBUTING.es.md) · [日本語](CONTRIBUTING.ja.md) · **简体中文** · [繁體中文](CONTRIBUTING.zh-TW.md) · [翻译指南](../I18N.md)

<!-- English source: CONTRIBUTING.md at a25a58aece9c5337340c352eb431b83a041d1d47; reviewed 2026-10-10. -->

保持本地处理为默认方式，并明确说明每一个可选的远程处理目标。功能必须说明限制；当模型、权限或平台功能不可用时，应向用户明确显示失败。

<a id="join-in"></a>

## 参与贡献

欢迎提交错误报告、修正文档、改善无障碍体验，以及贡献代码。创建 issue 前，请先查看已有 issue。对于较大的变更，请先在 issue 中描述行为和范围，供贡献者讨论。私下报告安全漏洞的方式，请参阅 [SECURITY.md](../../SECURITY.md)。

Fork 仓库，为你的变更创建分支，然后向 `main` 提交 pull request。请附上简短说明和已执行的检查。小型文档修正不需要原生工具链。

有关特定集成方向的贡献，请参阅[社区贡献计划](../COMMUNITY_GROWTH.md)。

<a id="setup"></a>

## 环境设置

使用 Node 24 LTS 和 Rust 1.98 或更高版本。原生构建还需要 CMake、libclang、C/C++ 编译器，以及 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm ci
npm run dev          # browser sample workspace
npm run tauri dev    # native app; models installed manually in Settings' directory
```

`npm run dev` 启动浏览器示例工作区；`npm run tauri dev` 启动原生应用，模型需要手动安装到设置中显示的目录。

模型文件名和受支持的行为，请参阅 [README](README.zh-CN.md)。

<a id="engineering-rules"></a>

## 工程规则

1. 运行时网络通信只能放在经过审查的原生 `providers.rs` 和 `auth.rs` 模块中。保留端点校验、向设备外发送数据前的同意机制、重定向／代理阻止、响应大小限制和凭据隔离。渲染进程的 CSP 应始终仅允许应用 IPC。不要添加分析追踪、隐藏上传、远程资源或静默云端回退。任何新的处理目标都需要明确的产品和安全审查。
2. 每一张存有数据的表都必须纳入保留期限处理和完整资料库删除。修改数据库结构、迁移、FTS 和删除逻辑时，应添加回归测试。不要承诺从 SSD 或备份中进行物理擦除。
3. 在增强处理之前先持久化原始转写文本。涉及多张表的写入应使用事务。不要信任渲染进程提供的时间戳、模型输出结构或导入的 JSON。
4. 向用户显示错误，并保留恢复路径。不要将示例数据、预设回答或固定的网络计数器显示为真实的桌面端结果。
5. 将开销较大的推理和音频任务移出 UI 线程。更改录制、保留期限和删除逻辑时，遵守录制互斥机制。

<a id="before-submitting"></a>

## 提交之前

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

请同时提交两个依赖锁文件。在 pull request 中说明行为、验证情况和仍存在的平台限制。使用 conventional commits 风格的提交信息，并将相关变更放在一起。切勿提交会议资料库、音频、模型权重、凭据或签名密钥。

<a id="useful-next-work"></a>

## 值得继续推进的工作

- 在每个操作系统上实现并测试原生系统音频回环录制。
- 为录制期间进程终止的情况添加检查点恢复。
- 使用真实模型验证长会议的转写和摘要。
- 添加资料库分页，以及长转写文本的渲染基准测试。
- 在实际硬件上测试模型兼容性、无障碍体验和打包后的权限。

请按 [SECURITY.md](../../SECURITY.md) 中的说明报告安全问题。保持友善、直接的交流。贡献内容采用 Apache-2.0 许可证。
