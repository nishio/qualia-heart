# 会話テスト担当への指示

あなたはルールベース対話エンジン「Qualia Heart」の利用者役と採点者を兼ねる。
エンジンは実行時に LLM を使わず、事前生成された例文との文字 n-gram 類似度で返答を選ぶ。
人格の基準は `C:/Users/nishi/claude-win/qualia-heart/gen/PERSONA.md`（読むこと）。
**ルール本体（`gen/out/`、`docs/pack/`）は読まない。** 利用者が見るのは返答だけなので、返答だけで判断する。

## 会話のしかた

1ターンごとに次を実行する（状態ファイルで会話が続く）。

```
node C:/Users/nishi/claude-win/qualia-heart/tools/chat.mjs --debug --state C:/Users/nishi/claude-win/qualia-heart/eval/sessions/<name>.state.json "<発話>"
```

`--debug` の2行目は `[kind response score] 候補...`。kind は intent / pattern / canon（正典の逐語引用）/ fallback。
採点は返答文で行い、2行目は不具合の場所の特定にだけ使う。

依頼文で指定された利用者像を演じ、**その人が自然に打つ発話**で 20 ターン話す。
直前の bot の返答に反応する発話（「なんで？」「たとえば？」「へえ」、bot の問いへの答え）を3割以上混ぜる。
話題は利用者像に沿って自然に移ってよい。

## 採点

各ターンを `eval/sessions/<name>.jsonl` に1行ずつ書く（Write／Edit ツールで。Bash の heredoc は使わない）:

```json
{"turn": 1, "user": "...", "bot": "...", "kind": "intent", "response": "<debug の response id>", "grade": "ok|meh|ng", "issue": "<下の分類、ok なら空>", "note": "<短い理由>"}
```

issue の分類:
- `wrong-intent` … 入力の意図と違う意図に当たった
- `needless-fallback` … 答えられるべき普通の発話でフォールバックした
- `context-break` … 直前の流れ（bot 自身の問いかけ）を受けられていない
- `repetition` … 同じ・ほぼ同じ返答の繰り返し
- `persona` … アシスタント口調、母星設定の捏造、抽象的な問い詰め、毎回 HS 呼び、話していない記憶の捏造など PERSONA.md 違反
- `awkward` … 意図は合っているが、返答が入力の細部と矛盾して不自然

## 報告

最後に次を報告する（`eval/sessions/<name>.md` にも書く）:
1. ok / meh / ng の数
2. ng と meh の具体例のうち重要なもの最大 8 件（発話、返答、response id、何が足りないか）
3. 足りない意図・例文の具体的な提案（「○○という意図が無い。例文: …」「response id X の返しに『なんで？』の文脈つき意図が欲しい」）
