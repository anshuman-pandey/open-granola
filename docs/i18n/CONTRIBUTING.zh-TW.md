<!-- Translation of CONTRIBUTING.md at a25a58aece9c5337340c352eb431b83a041d1d47; reviewed 2026-10-10. English is the source of truth. -->
# 為 Open Granola 貢獻

[English](../../CONTRIBUTING.md) · [हिन्दी](CONTRIBUTING.hi.md) · [Español](CONTRIBUTING.es.md) · [日本語](CONTRIBUTING.ja.md) · [简体中文](CONTRIBUTING.zh-CN.md) · 繁體中文 · [翻譯指南](../I18N.md)

維持以本機處理為預設，並明確說明每個選用的遠端目的地。功能必須說明限制；模型、權限或平台功能無法使用時，必須清楚顯示錯誤。

## 參與貢獻

歡迎回報錯誤、修正文件、改善無障礙體驗與貢獻程式碼。建立新 issue 前，請先查看既有 issue。較大的變更請先在 issue 中描述行為與範圍，讓貢獻者能先討論。私下回報漏洞的方式，請參閱 [SECURITY.md](../../SECURITY.md)。

請 fork 此儲存庫、為您的變更建立分支，並向 `main` 提交 pull request。附上簡短說明與已執行的檢查。小幅文件修正不需要原生工具鏈。

若要針對整合功能貢獻，請參閱[社群貢獻計畫](../COMMUNITY_GROWTH.md)。

## 環境設定

請使用 Node 24 LTS 與 Rust 1.98 或更新版本。原生建置還需要 CMake、libclang、C/C++ 編譯器，以及 [Tauri 平台相依套件](https://v2.tauri.app/start/prerequisites/)。

```sh
npm ci
npm run dev          # browser sample workspace
npm run tauri dev    # native app; models installed manually in Settings' directory
```

模型檔名與支援的行為，請參閱 [README](README.zh-TW.md)。

## 工程規則

1. 執行時的網路功能僅能放在已審查的原生 `providers.rs` 與 `auth.rs` 模組中。保留端點驗證、裝置外傳送同意、重新導向／代理封鎖、回應大小限制與憑證隔離。渲染器 CSP 的連線權限應限制為應用程式 IPC。不要加入分析追蹤、隱藏上傳、遠端資源，或未提示的雲端備援切換。任何新目的地都需要明確的產品與安全審查。
2. 每個儲存資料的資料表都必須納入保留期限與完整會議庫刪除機制。結構、遷移、FTS 與刪除行為的變更，必須加入回歸測試。不要承諾可從 SSD 或備份中實體抹除資料。
3. 先持久儲存原始逐字稿，再進行增強處理。寫入多個資料表時使用交易。不要信任渲染器提供的時間戳記、模型輸出結構或匯入的 JSON。
4. 向使用者顯示錯誤，並保留復原途徑。不要將範例資料、預設回答或固定的網路計數器當成真正的桌面版結果顯示。
5. 高負荷的推論與音訊工作不得在 UI 執行緒上執行。變更錄音、保留期限與刪除功能時，請遵守錄音互斥機制（capture gate）。

## 提交前

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

請將兩份相依套件鎖定檔一併提交。在 pull request 中描述行為、驗證方式，以及剩餘的平台限制。使用 Conventional Commits 格式的提交訊息，並將相關變更放在一起。切勿提交會議庫、音訊、模型權重、憑證或簽署金鑰。

## 值得接著投入的工作

- 在各作業系統上實作並測試原生系統音訊回送錄製。
- 加入錄音過程中程序終止時的檢查點復原功能。
- 使用真實模型驗證長會議的轉錄與摘要。
- 加入會議庫分頁與長逐字稿渲染的效能基準測試。
- 在實際硬體上測試模型相容性、無障礙體驗與封裝後的權限。

請依 [SECURITY.md](../../SECURITY.md) 回報安全問題。請保持友善、直接的溝通。所有貢獻均採用 Apache-2.0 授權。
