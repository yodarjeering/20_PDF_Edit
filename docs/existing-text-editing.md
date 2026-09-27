# 既存PDF文字編集 実装報告

## 今回の到達範囲

必須範囲のTextObject、PDF.js文字抽出、クリック選択、編集UI、元情報の保持、
Overlay保存、FontResolver、Base64登録基盤を実装しました。
Content Streamの調査・読み取り専用の字句解析は追加しましたが、直接書き換えは
有効にしていません。内部の編集方式は現在 `overlay` / `unsupported` です。
`directEditStrategy` は将来の差し替え口で、現時点では必ず書き換えを拒否します。

**Overlayは元の文字を削除しません。元の文字列は検索・コピー・抽出可能なまま
PDF内部に残ります。墨消し・機密情報の除去には使用できません。**
画面にも同じ説明を表示しています。

今回、フォントの巨大なBase64データを生成・追加していません。
前の作業で同梱済みの6書体・12フォントを利用します。Gitコミットも行っていません。

## 操作

1. 「編集結果」の「既存文字」タブを開き、ページ上の文字をクリックします。
2. Text、Font、Size、文字色を編集し、「変更を適用」を押します。
3. 背景色は初期値が白です。色付きの背景では適切な色を指定してください。
4. 「入力を取消」は未適用の入力を戻し、「元の文字へ戻す」はその箇所の編集を解除します。
5. 別の箇所へのクリック・履歴操作・保存時も未適用の変更を検証して反映します。
   不正な入力では処理を止め、入力内容を残してエラーを表示します。

元PDFの閲覧タブでは既存文字を変更しません。新しく追加するテキストボックスの
ページ上での直接入力、画像・図形編集は従来どおりです。

## 調査した既存アーキテクチャ

| 対象 | 調査結果・利用方法 |
| --- | --- |
| PDF.js初期化 | `js/documents.js`。ローカルWorker/CMaps/標準フォント/WASMを使用 |
| Canvas描画 | `js/renderer.js`。元ページ回転＋編集回転、viewport、倍率、DPRを使用 |
| 保存 | `js/exporter.js`。pdf-libで元ページをコピーし、オブジェクトを描画して保存 |
| ページモデル | `PageModel.pages`。ページID、sourceId、sourcePage、rotation、images |
| 追加テキスト | `js/text.js` / `js/images.js`。共通メトリクス、Canvas、編集用textarea |
| 座標変換 | `imageMatrix` とPDF.js viewport。既存文字にはTextItemのaffine transformを使用 |
| Undo/Redo | immutable更新前のsnapshotを保存。履歴は最大100操作 |
| フォント | `js/fonts.js`。Base64モジュール、FontFace、fontkit、使用Glyphのサブセット出力 |

既存のページ・images配列を作り替えず、ページに `textEdits` の辞書を追加しました。
原文抽出結果は元PDF側のキャッシュに、変更後のTextObjectは出力ページごとの
辞書に保持します。コピーしたページの編集は独立し、Undo/Redoも従来のsnapshotに
含まれます。元のPDFバイト列は書き換えません。

## TextObjectと座標

`id` はsourceId・元ページ番号・TextItemのインデックスから作成します。
同じ文字列が同じページに複数あっても識別できます。

保持する情報:

- `originalText`, `text`, `source: 'pdf'`, `isModified`
- `x`, `y`, `position`, `width`, `height`, `size`
- `fontName`, `normalizedFontName`, `fontFamily`, `pdfjsFontName`
- `fontSize`, `originalFontSize`, `transform`, `pageIndex`, `sourceId`
- `color`, `originalColor`, `ascent`, `descent`, `pdfFontRef`, `embeddedFont` のメタ情報
- `fontSubtype`, `encoding`, `hasToUnicode`, `editMode`, `unsupportedReason`
- 編集設定 `fontChoice`, `background` と解決結果 `resolvedFont`

`pageIndex` は元PDFの0始まりのページ番号です。並べ替え後の出力ページ番号とは
区別します。フォントバイナリはTextObjectや履歴に複製しません。

文字・transform・幅・高さは `getTextContent()` のTextItemから取得します。
色は公開API `getOperatorList()` のGlyph列と描画状態を照合して取得します。
照合できない色はnullのまま保持し、色を選ぶまで編集を確定しません。
フォント名は6文字の大文字Subset接頭辞だけを取り除き、元の名前も残します。
PDF.jsのフォントIDとPDFリソースを特定できない場合は、元フォント未特定と表示します。

選択矩形は元の文字transformとviewport.transformを合成します。
ページ回転・追加回転・ズームを通して同じPDF座標を使います。

## フォント維持

`FontResolver` は次の順番で解決します。

1. Font Dictionary / FontDescriptorから元の埋め込みプログラムを確認します。
2. `FontFile2` (TrueType) または `FontFile3` のOpenTypeをfontkitで読み、
   新しい文字のUnicode Glyphがすべて存在する場合に元のバイト列を再利用します。
3. 埋め込みのないPDF標準14フォントは、同じ標準フォントを使用します。
4. 再利用できないSubset、Glyph不足、未埋め込みの非標準フォントなどは内蔵フォントへ
   切り替えます。明朝系の名前にはNoto Serif JP、その他にはNoto Sans JPを優先し、
   必要なら他の登録済み書体を調べます。太字も元のフォント名から判定します。
5. ユーザーが書体を明示した場合はその書体を使います。Glyph不足なら処理を止めます。

適用前に文字のエンコードとサブセット保存を検証します。
保存時に再び解決・検証し、エラー時はダウンロードを作りません。
解決結果と代替理由は編集UIに表示します。

Font Dictionary解析ではFont、FontDescriptor、FontFile/2/3、Type0、
DescendantFonts/CIDFont、Encoding、ToUnicodeの有無を確認します。
Encoding/CMapの完全な逆変換はまだ行いません。
Form XObjectなどでリソースの対応が曖昧な場合、フォント名を推測で割り当てません。
PDF.jsの `commonObjs` 等の非公開フォントデータは使用していません。

後からBase64フォントを登録する場合、アプリ初期化前に以下を呼び出します。
データ自体は別途、配布・埋め込み可能なフォントから用意してください。

```js
import {registerEmbeddedFont, base64ToBytes} from './js/fonts.js';

registerEmbeddedFont({
  id: 'my-font',
  label: '追加書体',
  regular: regularBase64,
  bold: boldBase64,
});
// base64ToBytes(base64) returns Uint8Array.
```

## 保存方式と精度

`existing-text-export.js` がStage Aを担当します。
元の文字のbaselineとtransformを保ち、元範囲を指定背景色の矩形で覆って
新しい文字を描画します。長い文字列は元幅に収まるよう横方向だけ縮めます。
文字サイズを指定しなければ、抽出した元サイズを使います。

プレビューも同じ関数で生成したPDFをPDF.jsで描画するため、保存と別の
Canvas文字レイアウトを使いません。追加画像・図形・テキストはその後に重ねます。
プレビューPDFは利用中の描画を保護しつつ6件を目安に保持し、元文書破棄時に解放します。

Overlayへの切り替え条件は、現段階では**対応可能な既存文字編集すべて**です。
Direct編集の条件が未確立なため、直接編集できると誤表示しません。
元フォントから内蔵フォントへの切り替えは上記のフォント解決と別の判定です。

## 現在の制限

- 元文字のContent Stream削除・置換は行いません。
- スキャン画像、アウトライン化された文字は抽出対象外。OCRは未対応です。
- 縦書き、右から左への文字組み、Type3字形、検出できた透過・クリップ・
  輪郭文字・複雑な描画状態は安全に編集できないものとしてブロックします。
- 改行・タブを追加しての編集は未対応です。1つのTextItemを1行として扱います。
- 背景の画像・グラデーション・罫線・近接する他の文字の復元はしません。
  指定背景色で覆うため、その領域にある他の描画も隠れます。
- 原文のTJ字間調整、文字ごとの装飾、すべての組版機能の完全再現はしません。
  フォント変更や横方向の圧縮で見た目が変わる場合があります。
- 生のType1/CFF、Unicode cmapのないSubset、複雑なCMapの再利用は未対応です。
  日本語は抽出と内蔵フォントのGlyph検証を通る場合にOverlayで扱います。
- Form XObject内のFontリソースの完全な対応付けは未対応です。
  特定できない元フォントは表示上も未特定とし、代替フォントを使用します。
- 色・安全性の判定は公開OperatorListから確認可能な範囲です。
  任意の実PDFでの完全な描画解析を保証するものではありません。
- 暗号化PDFなど、従来の読み込み制限は変えていません。

## Stage Bに必要な残作業

`pdf-content.js` は、コメント、エスケープ付き文字列、16進文字列、TJ配列、
名前、数値を区別してストリームを読みます。
`BT ET Tf Tm Td TD T* Tj TJ ' "` を調査対象としますが、命令の実行や書き換えは
行いません。Inline Imageを含むストリームはバイナリ境界を未解析のため拒否します。

Direct編集には次が必要です。

1. q/Q、cm、テキスト状態、Form XObject、リソーススコープを含む完全な状態追跡。
2. TextItemから元ストリームの命令・バイト範囲への一意な対応付け。
3. Encoding/Differences/ToUnicodeとType0のCMap/CIDToGIDMapの双方向変換。
4. TJの字間数値、文字進行位置、文字間隔・単語間隔・水平倍率の再計算。
5. フォントリソース置換が必要な場合のスコープ分離、共有XObjectの複製。
6. 更新したストリームだけを安全に再圧縮・参照更新し、失敗時は変更を破棄。
7. 再読込・抽出・ピクセル比較での事後検証後にのみDirect保存を許可。

単純な `(text) Tj` の正規表現置換は採用していません。

## ファイル一覧

今回変更した既存ファイル:

| ファイル | 内容 |
| --- | --- |
| `index.html` | 既存文字タブ、Text/Font/Size、色、原情報、Overlay説明 |
| `theme.css` | 編集パネル、透明な選択レイヤー、選択枠 |
| `js/app.js` | パネル統合、編集確定、履歴・保存・ページ移動との連携 |
| `js/documents.js` | 抽出・Font解析・編集済みプレビューのキャッシュと解放 |
| `js/renderer.js` | 編集済みページの共通描画、描画利用数の解放 |
| `js/exporter.js` | 既存文字のOverlayを追加オブジェクトより先に出力 |
| `js/model.js` | immutableな既存文字更新・復元と履歴への統合 |
| `js/fonts.js` | Base64→Uint8Array、後付けフォント登録 |
| `package.json` | 単体テストコマンドへの新規テスト追加 |
| `readme.md` | 操作、制限、テスト、詳細報告へのリンク |

今回新規追加したファイル:

| ファイル | 内容 |
| --- | --- |
| `js/text-objects.js` | TextObject変換、色照合、座標・描画方式判定 |
| `js/pdf-fonts.js` | フォント名正規化、辞書・埋め込み解析、資源対応付け |
| `js/pdf-content.js` | 読み取り専用の字句解析とStage Bの差し替え口 |
| `js/font-resolver.js` | Glyph検証、元フォント再利用・内蔵フォントへの切り替え |
| `js/existing-text-export.js` | 検証とStage A描画。プレビューと保存で共通利用 |
| `js/existing-text-editor.js` | 選択レイヤー、編集UI、確定・取消・復元 |
| `tests/existing-text.test.mjs` | モデル・字句解析・メトリクス・Glyph・Base64の単体テスト |
| `tests/existing-text-browser.mjs` | 生成PDFを使うEdge統合テスト |
| `docs/existing-text-editing.md` | 本報告 |

ワークスペースには前の作業の未コミット変更・フォント資産もあります。
上記は今回の依頼で変更・追加したファイルの一覧です。

## テストとビルド

実行済みの検証（すべて成功。単体テストは `npm test` と同じ `node --test` コマンドで実行）:

```sh
npm test
node tests/existing-text-browser.mjs
node tests/browser.mjs
node tests/images-browser.mjs
node tests/text-browser.mjs
```

- 単体テスト11件：既存5件＋新規6件。
- 既存文字：英数字、同一文字列の別位置、元色・サイズ・フォント、Undo/Redo、
  ズーム、回転、複数ページ、未適用のまま保存、復元とUndo。
- フォント：未埋め込みHelvetica、日本語Type0/CIDFont、Subsetの代替、
  埋め込みTrueTypeの再利用、明示書体・サイズ変更。
- ストリーム：TJ配列、16進文字列、quote/double quote、エスケープ、
  不正な文字列・Inline Imageでの解析拒否。
- 拒否系：複数行入力を維持したまま拒否、透過文字の編集無効化。
- 出力をPDF.jsで再読込して描画・文字抽出。回転ページのプレビューと保存PDFをピクセル比較し、元色の維持も検証。Overlayで元文字が残ることも検証。
- 回帰：ページ結合・並べ替え・削除・回転・コピー・Undo/Redo・103ページ一覧、
  画像、4種の図形、追加テキストの直接入力、12フォント、保存PDFの位置と色。

このアプリはビルド工程のないES Modules構成です。依存追加・バンドル生成は不要です。
JavaScript構文チェック、上記テスト、`git diff --check` は成功しました。

参照: [PDF.js公開API](https://mozilla.github.io/pdf.js/api/draft/api.js.html)、
[pdf-lib PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument)。
