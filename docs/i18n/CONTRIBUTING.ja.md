<a id="contributing-to-open-granola"></a>

# Open Granola への貢献

[English](../../CONTRIBUTING.md) · [हिन्दी](CONTRIBUTING.hi.md) · [Español](CONTRIBUTING.es.md) · **日本語** · [简体中文](CONTRIBUTING.zh-CN.md) · [繁體中文](CONTRIBUTING.zh-TW.md) · [翻訳ガイド](../I18N.md)

<!-- English source: CONTRIBUTING.md at a25a58aece9c5337340c352eb431b83a041d1d47; reviewed 2026-10-10. -->

ローカル処理を既定とし、任意で使うリモートの送信先をすべて明示してください。各機能は制限を説明し、モデル、権限、プラットフォームの機能が利用できない場合には、失敗をユーザーに見える形で伝える必要があります。

<a id="join-in"></a>

## 参加する

バグ報告、ドキュメントの修正、アクセシビリティの改善、コードの貢献を歓迎します。新しい Issue を作成する前に、既存の Issue を確認してください。大きな変更では、まず Issue で動作と変更範囲を説明し、貢献者同士で検討できるようにしてください。脆弱性を非公開で報告する方法は [SECURITY.md](../../SECURITY.md) を参照してください。

リポジトリをフォークし、変更用のブランチを作成して、`main` に対するプルリクエストを開いてください。簡潔な説明と、実行したチェックを記載してください。ドキュメントの小さな修正には、ネイティブのツールチェーンは不要です。

連携機能に絞って取り組む場合は、[コミュニティ貢献計画](../COMMUNITY_GROWTH.md)を参照してください。

<a id="setup"></a>

## セットアップ

Node 24 LTS と Rust 1.98 以降を使用してください。ネイティブビルドには、CMake、libclang、C/C++ コンパイラー、および [Tauri のプラットフォーム別依存関係](https://v2.tauri.app/start/prerequisites/)も必要です。

```sh
npm ci
npm run dev          # browser sample workspace
npm run tauri dev    # native app; models installed manually in Settings' directory
```

`npm run dev` はブラウザのサンプルワークスペースを起動します。`npm run tauri dev` はネイティブアプリを起動します。モデルは「設定」に表示されるディレクトリに手動でインストールしてください。

モデルのファイル名と対応する動作は [README](README.ja.md) を参照してください。

<a id="engineering-rules"></a>

## エンジニアリングのルール

1. 実行時のネットワーク通信は、レビュー済みのネイティブモジュール `providers.rs` と `auth.rs` に限定してください。エンドポイントの検証、デバイス外への送信の同意、リダイレクトとプロキシの遮断、応答サイズの上限、認証情報の分離を維持してください。レンダラーの CSP はアプリ IPC に制限してください。分析機能、隠れたアップロード、リモートのアセット、通知なしにクラウドへ切り替える代替処理を追加しないでください。新しい送信先には、明示的な製品レビューとセキュリティレビューが必要です。
2. データを持つすべてのテーブルを、保存期間に基づく削除とライブラリ全体の削除の対象にしてください。スキーマ、移行、FTS、削除の変更には回帰テストを追加してください。SSD やバックアップからデータを物理的に消去できると約束しないでください。
3. ノートを生成する前に、生の文字起こしを永続化してください。複数のテーブルへの書き込みにはトランザクションを使用してください。レンダラーから渡されたタイムスタンプ、モデルの出力構造、インポートした JSON を信頼しないでください。
4. エラーをユーザーに表示し、復旧の手段を保持してください。サンプルデータ、定型の回答、固定のネットワークカウンターを、デスクトップで得られた実際の結果として表示しないでください。
5. 負荷の高い推論や音声処理は UI スレッドの外で実行してください。録音、保存期間、削除を変更する場合は、同時処理を制御する capture gate の規則に従ってください。

<a id="before-submitting"></a>

## 提出前の確認

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

依存関係のロックファイルは両方ともコミットしてください。プルリクエストには、動作、検証結果、プラットフォームに関する残りの制限を記載してください。Conventional Commits に沿ったコミットメッセージを使用し、関連する変更はまとめてください。会議ライブラリ、音声、モデルの重み、認証情報、署名キーは決してコミットしないでください。

<a id="useful-next-work"></a>

## 次に取り組めること

- 各 OS でネイティブのシステム音声ループバックを実装し、テストする。
- 録音中にプロセスが終了した場合に、チェックポイントから復旧する機能を追加する。
- 実際のモデルを使って、長い会議の文字起こしと要約を検証する。
- ライブラリのページ分割と、長い文字起こしの描画ベンチマークを追加する。
- 実機で、モデルの互換性、アクセシビリティ、パッケージ化したアプリの権限をテストする。

セキュリティ上の問題は [SECURITY.md](../../SECURITY.md) の手順に従って報告してください。思いやりを持ち、わかりやすく伝えましょう。貢献は Apache-2.0 の下でライセンスされます。
