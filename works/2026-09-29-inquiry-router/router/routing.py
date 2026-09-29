"""振り分けの決め方: いちばん確率の高い担当が しきい値 以上なら自動で回し、未満なら人に回す。"""
from dataclasses import dataclass

DEFAULT_THRESHOLD = 0.9


@dataclass(frozen=True)
class Routing:
    team: str                        # いちばん確率の高い担当
    probability: float               # その確率
    runner_up: tuple[str, float]     # 次に高い担当と確率（人に回すとき、候補として見せる）
    automatic: bool                  # True なら自動で回す、False なら人へ


def route(ranked: list[tuple[str, float]], threshold: float = DEFAULT_THRESHOLD) -> Routing:
    """ranked は decision.ranked の結果（確率の高い順）。"""
    if not 0 < threshold <= 1:
        raise ValueError("しきい値は 0 より大きく 1 以下")
    (team, p), runner_up = ranked[0], (ranked[1] if len(ranked) > 1 else ("", 0.0))
    return Routing(team, p, runner_up, p >= threshold)
