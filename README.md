# ゼータの旅路 ― リーマン予想 証明クエスト

Lean 4 による一般化リーマン予想の証明 ([grh-lean](https://github.com/lsernau/grh-lean) の `grh/`) の構成をたどる RPG 風ゲームです。
証明に必要な概念・数学構造を「アイテム」として集め、揃うと門が開いて証明の次のステップへ進みます。
アイテムは、その概念の具体例を自分で構成するパズルを解くと手に入ります。

## 遊び方

<https://khibino.github.io/zeta-quest/> で遊べます。
ローカルでは `index.html` をブラウザで開くだけです (ビルド不要・オフラインで動作)。

- 移動: 矢印キー / WASD / 画面クリック (タッチ端末では画面下の十字ボタン)
- 調べる・話す: スペース / Enter
- もちもの: `I`　証明ノート: `N`
- 進行状況はブラウザの localStorage に自動保存されます。

## 章と証明の対応

| 章 | 証明の該当部分 (`src/` 以下) | 集める概念 | 門で得る定理 |
|---|---|---|---|
| 1 零点の岬 | `New/Reduction/Zeros` | 二次指標 χ_K、フォン・マンゴルト関数、素数和の剰余 R_q | 片側判定法 |
| 2 データの峠 | `New/Reduction/Data` | パラメータ (q₀, d)、CM 体と π_N、a/b-素点、疎な集合 | 許容データの存在 |
| 3 格子の森 | `New/Reduction/Lattices` | 高さと積公式、共体積とアダマールの不等式、指数 | 素数ごとのツイスト (積公式) |
| 4 テータの洞窟 | `New/Derivatives`, `New/UpperBound` | 定符号エルミート空間、テータ級数、ジェットと階乗、シーソー恒等式 | 定理 A (短い形式) |
| 5 充填の平原 | `New/Spanning` | ポアンカレ級数、張る平行移動 | 定理 B (十分な形式) |
| 6 行列式の塔 | `New/Determinant`, `New/OneLift`, `New/Congruences` | m 重ツイスト、グラム行列式、小さなセルマー群 | 定理 C (整形式は長い) |
| 終 主不等式の祭壇 | `New/Reduction/MainInequality`, `OneSidedBound` | (6 つの定理を論理の順に並べる) | 主不等式 → GRH → RH |

パズルは各概念の**小さな模型**であり、証明そのものではありません
(例: d = 7, q₀ = 16 での素数和、ℚ(√−7) の整数環のテータ級数、(ℤ/13)ˣ の指標など)。

## ファイル構成

- `index.html`, `style.css` ― 画面
- `js/data.js` ― 章・アイテム・マップ・会話文
- `js/puzzles.js` ― パズル (判定ロジック `PuzzleLogic` と UI)
- `js/game.js` ― RPG エンジン (描画・移動・会話・セーブ)
- `test/` ― テスト。`sh test/run.sh` で、ロジック (node)・全パズルの UI・全章の通しプレイ (ヘッドレス Chrome) を実行

デバッグ用 URL: `index.html?ch=4` (第 4 章から開始)、`index.html?ch=4&puzzle=theta` (パズルを直接開く)。この場合セーブはされません。

## 出典

章立てとゲーム内の解説文は、[grh-lean](https://github.com/lsernau/grh-lean) の `grh/` にある `README.md`・`GUIDE.md`・`INDEX.md` と
各ファイル冒頭の説明を要約したものです (Copyright 2026 Anthropic, PBC、Apache License 2.0)。
同リポジトリの README によれば、証明は Levent Alpöge 氏によるもの (Claude と共同) です。
