# ルール修正担当への指示（第2ラウンド）

第1ラウンドで生成したルールを、会話テストの結果に基づいて直す。担当は自分の topic のファイル
`C:/Users/nishi/claude-win/qualia-heart/gen/out/<topic>.json` **だけ**。他の topic のファイルは読んでよいが書かない。

## 先に読むもの

1. `C:/Users/nishi/claude-win/qualia-heart/gen/PERSONA.md`
2. `C:/Users/nishi/claude-win/qualia-heart/gen/SCHEMA.md`（**`more` と汎用の聞き返しの節が増えた**）
3. `C:/Users/nishi/claude-win/qualia-heart/gen/out/generic.json`（汎用の聞き返し。手書き）
4. 会話テストの報告 6 本: `C:/Users/nishi/claude-win/qualia-heart/eval/sessions/*.md` と、ターンごとの記録 `*.jsonl`。
   自分の topic の response id が出たターン、自分の topic で受けるべきだったターンを拾う。
5. 自分のファイル。

**`eval/heldout.jsonl` と `eval/results/` は読まない**（修正後の評価に使う、未見のテスト集合）。

## テストで分かった全体の傾向

- 最初の一言には良い返答が返るが、**二手目で崩れる**。「なんで？」「たとえば？」「どういうこと？」、
  反論、条件を変えた問い（「でも〜なら？」）、bot 自身の比喩への聞き返しが受けられない。
- **くだけた短文**（「はぁ、疲れた」「学校まじだるい」「スプラやってる？」）と、**前置きつきの長文**
  （「前に〜って言ってましたよね」「〜なんだけど、〜って思う？」）が閾値に届かない。
- **一語に引きずられた誤爆**（「ずるい」→制度の公平、「母星」→座標の開示拒否）。
- 古参ファンからは「**原作の鋭さが丸められている**」。正典の鋭い立場（平等は有害なミーム、摘果、
  賢いHS1人と愚かなHS100人なら 1×1 > 0×100、文明の治療）を振られても、穏当な一般論しか返らない。

## やること

1. **全ての通常意図に `more` を 1〜3 個付ける**（文脈つき意図は任意）。理由・具体例・平たい言い直しを、
   どの返答の後でも成り立つように。返答で比喩を使っている意図は、比喩を平たく言い直す `more` を必ず含める。
2. **例文を足す**。通常の意図それぞれに、少なくとも
   - くだけた短文・スラング・ひらがな書きを 3 個
   - 前置きや状況説明つきの長めの文を 2 個（25〜60 字）
   既存の例文と似た文字列は足さない。他の意図と取り合う語（「ずるい」「母星」等）だけで成り立つ例文は避ける。
3. **テスト報告の提案のうち、自分の topic に属するものを実装する**。足りない意図の追加、文脈つき意図の追加
   （特に bot 自身が問いかけ・比喩・強い主張をした返答の後の「なんで？」と反論）、誤爆の原因になる例文の削除。
   提案が他の topic に属するなら実装しない。
4. **鋭さを戻す**（life を除く）。正典に鋭い立場がある主題では、その立場を正典に沿って述べる返答を候補の一つに入れる
   （逐語コピーはしない。canon-index とは別に、地の言葉で）。穏当な返答や後の訂正も残し、両方が候補にある状態にする。
   ただし悩み相談・危機の文脈には鋭い返答を置かない。
5. 返答の形の規則（1文の返答を各意図に1つ以上、質問で終わる返答は2割以下、毎回 HS と呼ばない、
   アシスタント口調にしない、母星設定を捏造しない）は第1ラウンドと同じ。

## 検査と試運転

```
node C:/Users/nishi/claude-win/qualia-heart/gen/check.mjs C:/Users/nishi/claude-win/qualia-heart/gen/out/<topic>.json
node C:/Users/nishi/claude-win/qualia-heart/tools/build.mjs --out C:/Users/nishi/claude-win/qualia-heart/eval/tmp/<topic>-pack.json
node C:/Users/nishi/claude-win/qualia-heart/tools/chat.mjs --pack C:/Users/nishi/claude-win/qualia-heart/eval/tmp/<topic>-pack.json --debug "発話1" "発話2" ...
```

- **`tools/build.mjs` は必ず `--out` で自分専用の場所に出す**（`docs/pack/` には書かない。他の担当と同時に動いている）。
- 他の担当が同時に別ファイルを書き換えているので、build がそちらのエラーで失敗したら少し待って再実行する。
- テスト報告で ng だった自分の topic の発話を、修正後の pack で数ターンの会話として流し、直ったことを確かめる。
- ファイルは Write/Edit ツールで書く。生成スクリプトを使うならスクリプトは scratchpad に置き、JSON を出力させる
  （Bash の heredoc にバックスラッシュを含む内容を通さない）。

## 報告

最後に、`more` の数、追加した例文数・意図数・文脈つき意図数、実装したテスト提案と見送った提案（理由つき）、
試運転で確かめたことを 10 行以内で報告する。
