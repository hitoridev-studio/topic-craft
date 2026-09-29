"""Jeff（Jev と同じ形で使える判定モデル）を手元の CPU で読み込み、選択肢ごとの確率を出す。

手順は Jeff の jeff/model.py の predict と同じ: 文を 1 回だけ通し、最後の位置の隠れ状態を選択肢の記号の出口（readout）に掛け、
モデルの設定にある温度で割って softmax する。文章は生成しない。
"""
import json
import os
import time
from pathlib import Path

import torch
from safetensors.torch import load_file
from transformers import AutoProcessor
from transformers.models.qwen3_5.modeling_qwen3_5 import Qwen3_5Model

from router.decision import decision_messages, ranked

MAX_OPTIONS = 255


class JeffModel:
    def __init__(self, checkpoint: str | Path, threads: int | None = None):
        torch.set_num_threads(threads or os.cpu_count() or 4)
        checkpoint = Path(checkpoint)
        config = json.loads((checkpoint / "decision_config.json").read_text())
        if config.get("prompt_layout", "state-first") != "state-first":
            raise ValueError("この道具は state-first の文の形のモデルだけを読む")
        self.codes: list[str] = config["codes"]
        self.temperature: float = config["temperature"]
        self.processor = AutoProcessor.from_pretrained(str(checkpoint))
        self.backbone = Qwen3_5Model.from_pretrained(str(checkpoint), dtype=torch.float32, attn_implementation="sdpa").eval()
        self.readout = torch.nn.Linear(self.backbone.config.text_config.hidden_size, MAX_OPTIONS, bias=False)
        self.readout.load_state_dict(load_file(str(checkpoint / "readout.safetensors")))

    @torch.inference_mode()
    def classify(self, state: str, instructions: str, criteria: dict[str, str | None]) -> tuple[list[tuple[str, float]], float]:
        """(確率の高い順の [(キー, 確率)], かかったミリ秒) を返す。"""
        messages = decision_messages(state, instructions, criteria, self.codes)
        text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        inputs = self.processor(text=[text], return_tensors="pt")
        started = time.perf_counter()
        hidden = self.backbone(**inputs, use_cache=False).last_hidden_state[:, -1]
        logits = self.readout(hidden).float()[0, : len(criteria)]
        probabilities = (logits / self.temperature).softmax(-1).tolist()
        return ranked(list(criteria), probabilities), (time.perf_counter() - started) * 1000
