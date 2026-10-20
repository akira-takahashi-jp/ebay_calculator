# eBay利益計算（PWA）

`利益計算表配布用2.xlsx` と同じ計算を行う、オフライン対応のWebアプリです。設定と入力内容はブラウザの localStorage（端末内）に保存されます。

## ファイル

| ファイル | 内容 |
| --- | --- |
| `index.html` / `app.js` | 画面（計算・設定・使い方） |
| `calc.js` | 計算エンジン（Excelの「計算詳細」「エコノミー送料」「FedEx 送料」「DHL 送料」の数式を移植） |
| `data.js` | 料金表・カテゴリー手数料（`tools/extract_data.py` でxlsxから生成） |
| `sw.js` / `manifest.webmanifest` / `icons/` | PWA（オフラインキャッシュ・ホーム画面追加） |

## ローカルで動かす

```bash
python3 -m http.server 8794
```

http://localhost:8794 を開きます。スマホのホーム画面に追加するにはHTTPSで配信してください（GitHub Pages や Cloudflare Pages など、静的ファイルを置くだけで動きます）。

## 料金表を更新するとき

xlsxの料金表を差し替えたら `data.js` を再生成し、`sw.js` の `VERSION` を上げます。

```bash
python3 tools/extract_data.py 利益計算表配布用2.xlsx data.js
```

## 検証

```bash
node tests/check_excel.js
```

Excelに保存されている計算結果（14配送×利益・還付込み・送料）と一致するか確認します。
