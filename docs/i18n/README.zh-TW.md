<!-- Translation of README.md at a25a58aece9c5337340c352eb431b83a041d1d47; reviewed 2026-10-10. English is the source of truth. -->
<p align="center">
  <img src="../assets/logo.svg" width="72" alt="Open Granola 標誌" />
</p>

<h1 align="center">Open Granola</h1>

<p align="center">
  <strong>逐字稿留在本機。會議筆記的 AI 由您選擇。</strong><br/>
  以 Tauri、React 與 Rust 打造，採用 Apache-2.0 授權的桌面會議筆記本。
</p>

<p align="center">
  <a href="#try-the-preview">試用預覽版</a> ·
  <a href="#models-and-connections">模型</a> ·
  <a href="../ARCHITECTURE.md">架構</a> ·
  <a href="../../PRIVACY.md">隱私</a> ·
  <a href="../COMPETITIVE_RESEARCH.md">研究與優先事項</a>
</p>

<p align="center">
  <a href="../../README.md">English</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.es.md">Español</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · 繁體中文 · <a href="../I18N.md">語言支援</a>
</p>

**開發預覽版。** Open Granola 會錄製麥克風音訊，使用本機 Whisper 轉錄，再透過本機模型或您連接的供應商，將逐字稿整理成筆記。您的會議庫儲存在本機 SQLite 資料庫。使用雲端摘要時，逐字稿文字會傳送給所選的供應商。

系統音訊錄製尚未實作：此版本不會透過耳機錄下通話另一端的聲音。實際麥克風與模型工作階段、供應商帳號及封裝版本，仍需要在預定硬體上進行端到端測試。瀏覽器預覽版使用明確標示的範例會議。

## 已實作的功能

- **麥克風轉錄：** 本機 `whisper.cpp`、附有時間戳記的逐字稿片段，以及可見的即時逐字稿。
- **摘要供應商選擇：** 內建 Qwen、LM Studio、OpenAI API、Claude API、自訂 OpenAI 相容端點，以及實驗性的「使用 ChatGPT 登入」。
- **連線測試：** 透過合成文字請求檢查所選摘要工具，不會傳送會議內容。這項測試不會測試麥克風錄音或 Whisper。
- **已儲存會議的復原：** 逐字稿會先儲存，再產生摘要。摘要失敗時可重試，無須重新錄音。重新產生筆記時，既有待辦事項的 ID 與完成狀態會保留。
- **處理詳情：** 已儲存的會議會記錄當時設定的模型／供應商路徑與摘要狀態，避免日後變更設定後無法得知筆記的產生方式。
- **本機會議庫：** 關鍵字搜尋、針對檢索到的文字提問、待辦事項、承諾事項、Markdown 配方、JSON 匯入與 Markdown 匯出。
- **保留期限控制：** 移除過期會議或清除本機會議庫。限制詳見[隱私說明](../../PRIVACY.md)。

產生的筆記與承諾事項需要人工檢查。發言者辨識、語意／向量搜尋、行事曆整合、從指定會議服務直接匯入、加密音訊播放，以及原生系統音訊錄製均尚未實作。

<a id="models-and-connections"></a>
## 模型與連線

轉錄與摘要負責不同工作。**目前，無論使用哪個摘要供應商，錄音都需要本機 Whisper。** 此版本不提供雲端轉錄 API。

| 摘要路徑 | 設定方式 | Open Granola 傳送的內容 |
|---|---|---|
| 內建本機 Qwen | 安裝 `qwen3-4b-q4.gguf` | 不會發出供應商請求 |
| LM Studio | 啟動其 OpenAI 相容伺服器；使用 `http://127.0.0.1:1234/v1` 與已載入的模型 ID | 將文字傳送至此裝置上的伺服器 |
| OpenAI API | 您的 API 金鑰與支援的模型 ID | 將文字傳送至 OpenAI；適用 API 計費 |
| Claude API | 您的 Anthropic API 金鑰與模型 ID | 將文字傳送至 Anthropic；適用 API 計費 |
| OpenAI 相容 | 相容的基底 URL、模型 ID 與選用金鑰；例如本機 Ollama 伺服器 | 將文字傳送至設定的伺服器 |
| ChatGPT 方案 — 實驗性 | 選擇**使用 ChatGPT 繼續**，授權符合資格的方案用量，再選擇模型 | 使用已授權的方案，將文字傳送至 OpenAI |

ChatGPT 路徑使用[供開放原始碼／本機應用程式使用的官方登入流程](https://developers.openai.com/siwc/token-sharing-open-source)。它不會授予存取既有 ChatGPT 對話的權限。使用資格與模型可用性取決於帳號及供應商。此整合尚未以真實帳號完成端到端驗證。在本應用程式中，它支援文字請求；[該預覽版不支援音訊轉錄](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

Claude 透過 API 金鑰連接；此應用程式不提供 Claude 個人帳號登入。OpenAI API 金鑰與 ChatGPT 方案登入是兩條不同路徑。

### 連接摘要工具

設定指南：[LM Studio](../integrations/LM_STUDIO.md) · [Ollama](../integrations/OLLAMA.md)。

1. 在桌面版應用程式中開啟**設定 → 模型與連線**。
2. 選擇供應商並輸入完整的模型 ID。若使用自訂伺服器，請輸入其文件指定的 API 基底 URL。
3. 若使用 ChatGPT，請連接帳號並選擇**載入可用模型**，或輸入帳號支援的模型 ID。若目的地位於裝置外，請啟用允許傳送文字的設定。這也涵蓋助理與配方使用的相關已儲存筆記。
4. 儲存設定，然後執行**測試連線**。
5. 先錄製一小段麥克風音訊，確認逐字稿與筆記，再進行較長的錄音。

遠端端點必須使用 HTTPS；未加密的 HTTP 僅接受 `127.0.0.1` 等 IP 字面值回送位址。LM Studio 請使用上方所示的位址。自訂相容性必須經過測試：標示「OpenAI 相容」不代表每個端點都支援相同的請求欄位。模型失敗時，不會自動從本機處理切換至雲端處理。

金鑰由原生程式碼處理，並在可用時儲存於作業系統的憑證儲存區。若該儲存區無法儲存，應用程式會改用僅限本次使用期間的記憶體，並顯示此狀態。憑證不會存入會議資料庫或瀏覽器儲存空間。本機執行的伺服器本身可能會轉送請求；Open Granola 傳送文字後如何處理，取決於該伺服器的設定。

<a id="try-the-preview"></a>
## 試用預覽版

### 瀏覽器工作區

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

瀏覽器工作區展示範例會議，不會錄製音訊、執行原生推論或儲存供應商憑證。

### 桌面開發版本

請安裝 Rust **1.98 或更新版本**、Node **22.12 或更新版本**（建議使用 Node 24 LTS）、CMake、libclang、C/C++ 編譯器，以及 [Tauri 平台先決條件](https://v2.tauri.app/start/prerequisites/)。Linux 另外需要 ALSA、WebKitGTK 與設定中指定的 PipeWire 開發相依套件。macOS 套件的目標版本為 macOS 14.4 或更新版本。平台建置設定不代表已完成硬體品質驗證。

```sh
npm ci
npm run tauri dev
```

Tauri 掛鉤會先建置本機推論輔助程式，再啟動應用程式。若要建立發行套件：

```sh
npm run tauri build
```

建置輸出位於 `src-tauri/target/release/bundle`。簽署、公證，以及安裝／升級測試屬於另外的發行工作。準備好後，將驗證過的檔案發布至 [Releases](https://github.com/anshuman-pandey/open-granola/releases)；本 README 不保證提供預先建置的安裝程式。

### 安裝本機模型

「設定」會顯示實際模型目錄：`<app-data>/library/models/`。

- 將相容的 Whisper 模型安裝為 **`whisper-large-v3-turbo.bin`**，以錄製音訊。
- 僅在使用內建摘要工具時，才需要將相容的 GGUF 模型安裝為 **`qwen3-4b-q4.gguf`**。
- 使用 LM Studio 或雲端摘要工具時，仍需要 Whisper，但不需要內建 Qwen 檔案。

模型須手動安裝。應用程式不會代您下載、續傳或驗證發布者的校驗碼。請從可信任的發布者取得模型，並檢查格式與授權。檔案遺失或無效時，會顯示設定錯誤。

## 會議如何處理

```text
Microphone → local Whisper → saved local transcript
                                  ↓
                    selected local/server/cloud model
                                  ↓
                         notes, actions, commitments
```

流程：麥克風 → 本機 Whisper → 已儲存的本機逐字稿 → 所選的本機／伺服器／雲端模型 → 筆記、待辦事項與承諾事項。

筆記、逐字稿與處理詳情儲存在本機，沒有應用程式層級的資料庫加密。若逐字稿已寫入後摘要才失敗，可對已儲存的會議重試。錄音仍在記憶體中時發生的當機，無法靠此功能復原。音訊保留在 RAM 中，不會刻意寫入錄音檔案。

## 隱私說明

- 預設使用本機模型。將文字傳送至裝置外處理，需要設定供應商並取得同意。
- 原生網路功能已啟用，供供應商與 ChatGPT 登入使用。此版本**不是由作業系統強制執行的網路隔離環境**。
- Webview 僅能使用隨應用程式封裝的資源與本機應用程式 IPC。供應商請求在原生程式碼中執行。
- 應用程式未實作遙測或 Open Granola 雲端同步服務。連接的供應商有各自的資料政策。
- 刪除本機紀錄不會抹除供應商持有的資料、匯出檔案、作業系統快照或備份。

儲存、憑證、網路與刪除的詳細說明，請閱讀 [PRIVACY.md](../../PRIVACY.md) 與 [SECURITY.md](../../SECURITY.md)。

## 接下來的優先事項

[競品研究](../COMPETITIVE_RESEARCH.md)檢視了十個大型相關儲存庫，以及七個更接近或相鄰領域的產品。優先事項依使用者反覆遇到的問題決定，而不是競品 README 中的功能數量：

1. 使用真實模型與供應商帳號，驗證從全新安裝開始的完整麥克風工作流程；改善模型設定與封裝。
2. 在明確定義的平台矩陣上，實作並測試系統音訊、裝置切換、音訊訊號是否持續更新，以及長時間錄音。
3. 將決議與待辦事項連結至逐字稿段落，並在把 AI 推論視為已確認承諾前進行檢查。
4. 加入詞彙修正、明確的語言選擇，以及可復原的長會議處理。
5. 在核心紀錄可靠後，探索選擇性文字分享與限定範圍的代理存取。

這些都是規劃中的能力。研究與自動化測試不代表應用程式已能在您的會議環境中正常運作。

## 開發檢查

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

原生測試需要平台建置先決條件。變更錄音、憑證或資料處理前，請先閱讀[架構](../ARCHITECTURE.md)、[安全政策](../../SECURITY.md)與[貢獻指南](CONTRIBUTING.zh-TW.md)。

## 授權

[Apache-2.0](../../LICENSE)。模型檔案與第三方供應商適用各自的授權與條款。
