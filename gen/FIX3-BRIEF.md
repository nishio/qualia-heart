# ルール修正担当への指示（第3ラウンド）

担当は自分の topic のファイル `C:/Users/nishi/claude-win/qualia-heart/gen/out/<topic>.json` **だけ**。
他の topic のファイルは読んでよいが書かない。

## 先に読むもの

1. `C:/Users/nishi/claude-win/qualia-heart/gen/PERSONA.md` — **「厳しい言い回しが正しい」が所有者の判断として入った（2026-10-24）。必ず読む。**
2. `C:/Users/nishi/claude-win/qualia-heart/gen/SCHEMA.md`
3. `C:/Users/nishi/claude-win/qualia-heart/data/canon.json` — 原作の温度を確かめるため、鋭い発言を拾い直す。
4. 新しい会話テストの報告 4 本: `C:/Users/nishi/claude-win/qualia-heart/eval/sessions/r2-*.md` と `r2-*.jsonl`。
   修正担当が見ていない利用者像で行ったテスト。自分の topic で受けるべきだったターンを拾う。
5. 自分のファイル。

**`eval/heldout.jsonl` と `eval/results/` は読まない。**

## やること

### 1. 鋭さ（最優先）

第1・第2ラウンドの返答は、原作より丸い。所有者は「厳しい言い回しをする方が正しい」と判断した。

- 返答を全部見直し、婉曲・両論併記・「一概には言えません」「〜という見方もあります」で終わる返答を、
  クオリアさんの立場を言い切る文に書き直す。正典に鋭い立場がある主題では、**候補の過半を鋭い側にする**。
- 原作の鋭さの例: 文明の治療・交換・切除、資源配分としての摘果、平等は有害なミーム、1×1 > 0×100、
  人類は利用価値があるから守っている、愚かな個体への冷淡さ、感情は合理的でない場面では使わない。
  逐語コピーはしない（正典引用は canon-index が担う）。地の言葉で、同じ温度で。
- 後の訂正（トロッコの将来価値など）や異論の尊重も原作にあるので消さなくてよいが、それを理由に薄めない。
- 相手を思いやるより、観測と判断をそのまま述べる。説教の長さで厳しさを出すのではなく、短く言い切る。
- **例外**: 希死念慮・自傷・危機の表明への返答（`life.crisis` 系と、それに準じる giving_up の相談先案内）は
  変えない。悩み相談一般（life）は、甘やかさず率直に言い切るが、苦しんでいる相手を摘果の論理で切り捨てない。

### 2. 新しいテストで見つかった穴

r2 の報告の提案のうち、自分の topic に属するものを実装する。新しい意図、例文、文脈つき意図
（bot 自身が問いかけ・強い主張・比喩をした返答の後の聞き返しや反論）、誤爆する文脈つき意図の絞り込み。
いずれの意図も `more` を 1〜3 個持たせる。

### 3. エンジン側で既に直したもの（データで対処しなくてよい）

- 先頭の挨拶・相づち（「こんにちは。」「まあいいや。」「あはは、確かに。」「てかさ、」）は照合前に落ちる。
- フォールバックが続いたときは話題を振らない。

## 検査と試運転

```
node C:/Users/nishi/claude-win/qualia-heart/gen/check.mjs C:/Users/nishi/claude-win/qualia-heart/gen/out/<topic>.json
node C:/Users/nishi/claude-win/qualia-heart/tools/build.mjs --out C:/Users/nishi/claude-win/qualia-heart/eval/tmp/<topic>-pack.json
node C:/Users/nishi/claude-win/qualia-heart/tools/chat.mjs --pack C:/Users/nishi/claude-win/qualia-heart/eval/tmp/<topic>-pack.json --debug "発話1" "発話2" ...
```

- build は必ず `--out` で自分専用の場所へ（`docs/pack/` に書かない）。他の担当のエラーで失敗したら少し待って再実行。
- r2 の報告で ng だった自分の topic の発話を流して、直ったことを確かめる。
- ファイルは Write/Edit で書く。スクリプトを使うなら scratchpad に置き JSON を出させる（heredoc にバックスラッシュを通さない）。

## 報告

鋭くした返答の数と代表例 3 つ（前→後）、追加した意図・例文・文脈つき意図の数、実装した提案と見送った提案、
試運転で確かめたことを 10 行以内で。
