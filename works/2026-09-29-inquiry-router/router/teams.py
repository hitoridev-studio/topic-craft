"""担当の定義（teams.json）を読む。担当を増やす・変えるときは teams.json だけを書き換える。"""
import json
from dataclasses import dataclass
from pathlib import Path

TEAMS_FILE = Path(__file__).resolve().parent.parent / "teams.json"


@dataclass(frozen=True)
class TeamSet:
    instructions: str              # モデルに渡す質問の文
    threshold: float               # この確率以上なら自動で回す
    teams: dict[str, dict]         # キー → {name, description, color, mark}

    @property
    def criteria(self) -> dict[str, str]:
        """モデルに渡す選択肢（キー → 説明）。並び順が選択肢の記号の順になる。"""
        return {key: team["description"] for key, team in self.teams.items()}


def load_teams(path: str | Path = TEAMS_FILE) -> TeamSet:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return TeamSet(data["instructions"], float(data.get("threshold", 0.9)), data["teams"])
