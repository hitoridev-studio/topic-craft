# 測ったデータ（inquiries-ja.jsonl）

EC サイト・オンラインサービスの問い合わせ 330 件（11 の担当 × 30 件）。1 行に 1 件で、`text` が日本語の問い合わせ、`team` が正解の担当（`teams.json` のキー）、`source_text` が元の英語。

- 元のデータ: Bitext「Customer Service Tagged Training Dataset for LLM-based Virtual Assistants」（https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset 、CDLA-Sharing-1.0）。元のデータ自身が、自然な文を種に機械で広げて人が確かめた「半合成」のデータ。
- 選び方: `{{Order Number}}` のような差し込み記号を含まない行から、分野（`category`）ごとに 30 件を乱数（種 20260929）で選んだ。
- 日本語: 言語モデルで、日本の利用者が窓口に書く言い方に訳した（口調と崩れはそのまま残した）。人の目で全件を確かめてはいない。
- ライセンス: このファイルは元のデータの派生物なので、CDLA-Sharing-1.0（https://cdla.dev/sharing-1-0/ ）に従う。作品の他のファイル（コード）は MIT。
