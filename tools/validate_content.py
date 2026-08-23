#!/usr/bin/env python3
"""콘텐츠 정적 린트.

시뮬레이션 없이 data/*.json 의 불변식을 검사한다. 모든 콘텐츠 PR 을 게이트한다.
설계 불변식 8·11·17 의 정적 검사 부분에 해당한다.
"""
from __future__ import annotations
import json
import sys
from collections import Counter
from pathlib import Path

STATS = [
    "intellect", "sensibility", "etiquette", "craft", "stamina",
    "starsense", "courage", "eloquence", "commerce",
]
CATEGORIES = {"lesson", "work", "outing", "rest", "path"}
TIERS = {"basic", "advanced", "arcane"}
MIN_SOURCES_PER_STAT = 3

problems: list[str] = []


def err(msg: str) -> None:
    problems.append(msg)


def load(root: Path, name: str) -> dict:
    path = root / "data" / name
    if not path.exists():
        err(f"{name} 이 없다")
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        err(f"{name} 파싱 실패: {exc}")
        return {}


def check_actions(data: dict) -> None:
    actions = data.get("actions") or []
    if not actions:
        err("actions 가 비었다")
        return

    ids = Counter(a.get("id") for a in actions)
    for aid, n in ids.items():
        if n > 1:
            err(f"액션 id 중복: {aid} ({n}회)")

    for a in actions:
        aid = a.get("id", "?")
        if a.get("category") not in CATEGORIES:
            err(f"{aid}: 알 수 없는 category {a.get('category')!r}")
        if a.get("tier") not in TIERS:
            err(f"{aid}: 알 수 없는 tier {a.get('tier')!r}")
        for field in ("label", "place", "description"):
            if not str(a.get(field) or "").strip():
                err(f"{aid}: {field} 가 비었다")
        stat = a.get("stat")
        if stat is not None and stat not in STATS:
            err(f"{aid}: 알 수 없는 stat {stat!r}")
        sec = a.get("secondary")
        if sec is not None:
            if sec not in STATS:
                err(f"{aid}: 알 수 없는 secondary {sec!r}")
            elif sec == stat:
                err(f"{aid}: secondary 가 주 스탯과 같다")
        cost = a.get("cost") or {}
        for key in ("gold", "energy", "stress"):
            if not isinstance(cost.get(key), int):
                err(f"{aid}: cost.{key} 가 정수가 아니다")

    # 스탯 병목 금지. 구 구현은 magic/courage 소스가 각각 1개뿐이었다.
    sources: Counter = Counter()
    for a in actions:
        if a.get("stat"):
            sources[a["stat"]] += 1
        if a.get("secondary"):
            sources[a["secondary"]] += 1
    for stat in STATS:
        if sources[stat] < MIN_SOURCES_PER_STAT:
            err(f"스탯 '{stat}' 의 소스 액션이 {sources[stat]}개다. "
                f"최소 {MIN_SOURCES_PER_STAT}개여야 한다 (병목 금지)")

    # 카테고리 안에서 비용이 전부 같으면 선택이 스탯 벡터 고르기로 퇴화한다.
    # 구 구현은 수업 6종·일 6종·외출 4종이 각각 비용 튜플 1개였다.
    for category in ("lesson", "work", "outing"):
        tuples = {
            (a["cost"]["gold"], a["cost"]["energy"], a["cost"]["stress"])
            for a in actions if a.get("category") == category and a.get("cost")
        }
        if len(tuples) <= 1:
            err(f"category '{category}' 의 비용 튜플이 {len(tuples)}종뿐이다. "
                f"카테고리 안에서 차등화해야 한다")

    # 소프트락 방지: 자원과 무관하게 항상 선택 가능한 행동이 최소 2개.
    always = [a for a in actions if a.get("always_available")]
    if len(always) < 2:
        err(f"always_available 액션이 {len(always)}개다. 최소 2개여야 소프트락이 불가능하다")
    for a in always:
        if a["cost"]["gold"] < 0:
            err(f"{a['id']}: always_available 인데 금화를 소비한다. 소프트락이 가능해진다")

    # 진로 전용 비전은 선언된 경로만 참조해야 한다.
    path_ids = {p.get("id") for p in (data.get("paths") or [])}
    for a in actions:
        if a.get("category") != "path":
            continue
        declared = (a.get("unlock") or {}).get("declared_path")
        if declared not in path_ids:
            err(f"{a['id']}: 알 수 없는 진로 {declared!r}")
    if path_ids and len(path_ids) < 3:
        err(f"진로가 {len(path_ids)}개다. 월 7 선언에 최소 3개 선택지가 필요하다")


def check_endings(data: dict) -> None:
    endings = data.get("endings") or []
    if not endings:
        return  # 재저작 전에는 비어 있을 수 있다
    codes = Counter(e.get("code") for e in endings)
    for code, n in codes.items():
        if n > 1:
            err(f"엔딩 code 중복: {code} ({n}회)")
    # 요건 집합이 완전히 동일한 엔딩 쌍은 판정이 불가능하다 (설계 불변식 8)
    seen: dict[str, str] = {}
    for e in endings:
        reqs = e.get("requirements") or []
        if not reqs:
            continue
        key = json.dumps(sorted(json.dumps(r, sort_keys=True) for r in reqs))
        if key in seen:
            err(f"엔딩 '{e.get('code')}' 와 '{seen[key]}' 의 요건 집합이 동일하다")
        else:
            seen[key] = str(e.get("code"))


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    actions = load(root, "actions.json")
    if actions:
        check_actions(actions)
    endings_path = root / "data" / "endings.json"
    if endings_path.exists():
        check_endings(json.loads(endings_path.read_text(encoding="utf-8")))

    if problems:
        for p in problems:
            print(f"::error::{p}", file=sys.stderr)
        print(f"콘텐츠 린트 실패: {len(problems)}건", file=sys.stderr)
        return 1
    n = len((actions.get("actions") or []))
    print(f"콘텐츠 린트 통과. 액션 {n}개 검사.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
