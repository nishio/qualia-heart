# Qualia Heart

LLM を使わずにブラウザだけで動く、クオリアさんの辞書型対話エンジン。

**https://nishio.github.io/qualia-heart/** （GitHub Pages、`docs/` を公開）

1999〜2004 年の人工無脳「Heart」（人格データと再生エンジンを分けた文字列マッチの対話システム）の考え方を、
現代の LLM で作り直す実験。人手で書くのが大変だった会話ルール——とくに例文の言い換えと、
bot の発言を受けた文脈つきの返し——を LLM に大量に書かせ、実行時は静的ファイルと数百行の JavaScript だけで動かす。

## 仕組み

```
gen/PERSONA.md, gen/SCHEMA.md, data/canon.json
        │  LLM がトピックごとにルールを書く（gen/AGENT-BRIEF.md）
        ▼
gen/out/<topic>.json ── gen/check.mjs で検査
        │  tools/build.mjs
        ▼
docs/pack/qualia.json ── docs/engine.js がブラウザで読み込む
```

- **照合**: 入力を正規化（NFKC・小文字化・カタカナ→ひらがな・記号除去）し、各意図の例文と
  文字 1〜3-gram の TF-IDF コサイン類似度で比べる。正規表現ではなく例文との近さで当たる。
- **文脈つき意図**（Heart のデータファイル A 相当）: 直前の bot 発言を条件にする。bot の問いかけへの返しを受ける。
- **正典の引用**: 202 件の正典発言に、LLM がその発言が答えになる問いを付けて索引にした。
  引用は逐語（build 時に検査）。画面では「正典」バッジとリンクで区別する。
- **フォールバック**: どれにも当たらなければ、分からないと言うか、話題を振る。振った話題への返しも文脈つき意図で受ける。
- **記憶**: 名前などを `pattern` の名前付きグループで取り、`{name|あなた}` で返答に埋める。会話状態はブラウザの localStorage に残る。
- **繰り返し回避**: 直近に使った返答を避けて選ぶ（Heart の「消耗」の代わり）。

## 使い方

```sh
npm run build                                # build → embed（意味検索用の埋め込み）→ stamp（キャッシュ対策の ?v=）
node tools/build.mjs                         # gen/out → docs/pack/qualia.json だけ
node tools/chat.mjs --debug                  # 端末で対話（1行1ターン）
node tools/chat.mjs --state s.json "こんにちは"  # 1ターンずつ状態を保存して進める
node tools/eval.mjs eval/heldout.jsonl --out eval/results/heldout.jsonl
```

ブラウザでは `docs/` を静的に配信する（GitHub Pages は `docs/` を公開元にする）。

## 出典とライセンス

クオリアさんの原投稿は @Qualia_san によるもので CC BY 4.0（https://scrapbox.io/qualia-san/Qualia-san）。
`data/canon.json` は人間がレビューして投稿した正典 202 件と、公開アーカイブから組んだ 19 の対話事例。
`gen/out/` の会話ルールは LLM が生成したもので、原作の発言ではない。
