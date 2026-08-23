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

    # 모든 액션에 실재하는 아이콘이 있어야 한다. UI 가 빈 칸을 그리지 않게 한다.
    art_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".") / "assets" / "art"
    if art_dir.exists():
        have = {f.stem for f in art_dir.glob("*.webp")}
        for a in actions:
            icon = a.get("icon")
            if not icon:
                err(f"{a.get('id','?')}: icon 이 없다")
            elif icon not in have:
                err(f"{a.get('id','?')}: 아이콘 '{icon}' 파일이 없다")

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


def check_events(data: dict) -> None:
    events = data.get("events") or []
    if not events:
        err("events 가 비었다")
        return

    ids = Counter(e.get("id") for e in events)
    for eid, n in ids.items():
        if n > 1:
            err(f"이벤트 id 중복: {eid} ({n}회)")

    # 결과문은 전 코퍼스에서 유일해야 한다. 같은 이벤트 안에서 성공/실패가 같은 문장을
    # 쓰면 분기가 분기처럼 읽히지 않는다.
    seen_result_text: dict[str, str] = {}
    for e in events:
        eid = e.get("id", "?")
        for field in ("title", "body"):
            text = str(e.get(field) or "").strip()
            if not text:
                err(f"{eid}: {field} 가 비었다")
        choices = e.get("choices") or []
        # 선택지가 1개면 선택이 아니다. 구 구현의 자동 적용 통보로 되돌아간다.
        if len(choices) < 1:
            err(f"{eid}: 선택지가 없다")
        if e.get("category") != "world" and len(choices) < 2:
            err(f"{eid}: 선택지가 {len(choices)}개다. world 외에는 2개 이상이어야 한다")

        cids = Counter(c.get("id") for c in choices)
        for cid, n in cids.items():
            if n > 1:
                err(f"{eid}: 선택지 id 중복 {cid}")

        for c in choices:
            cid = f"{eid}:{c.get('id','?')}"
            if not str(c.get("label") or "").strip():
                err(f"{cid}: label 이 비었다")
            if c.get("requirements") and not str(c.get("locked_reason") or "").strip():
                err(f"{cid}: 요건이 있는데 locked_reason 이 없다. "
                    f"미충족 선택지는 숨기지 않고 사유와 함께 노출해야 한다")
            outcomes = c.get("outcomes") or []
            if not outcomes:
                err(f"{cid}: outcomes 가 없다")
            kinds = [o.get("kind") for o in outcomes]
            if c.get("check"):
                if sorted(k for k in kinds if k) != ["failure", "success"]:
                    err(f"{cid}: 판정이 있으면 success/failure 결과가 둘 다 있어야 한다. 실제 {kinds}")
            else:
                if kinds != ["only"]:
                    err(f"{cid}: 판정이 없으면 only 결과 하나여야 한다. 실제 {kinds}")
            for o in outcomes:
                text = str(o.get("result_text") or "").strip()
                if not text:
                    err(f"{cid}: result_text 가 비었다")
                    continue
                # 같은 문장을 재사용하면 분기가 분기처럼 읽히지 않는다.
                if text == str(e.get("body") or "").strip():
                    err(f"{cid}: result_text 가 본문과 같다. "
                        f"본문은 상황을, 결과문은 무엇이 일어났는지를 말해야 한다")
                if text in seen_result_text:
                    err(f"{cid}: result_text 가 '{seen_result_text[text]}' 와 중복된다. "
                        f"분기마다 다른 문장이어야 한다")
                else:
                    seen_result_text[text] = cid


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
    events_path = root / "data" / "events.json"
    if events_path.exists():
        check_events(json.loads(events_path.read_text(encoding="utf-8")))
    endings_path = root / "data" / "endings.json"
    if endings_path.exists():
        check_endings(json.loads(endings_path.read_text(encoding="utf-8")))

    if problems:
        for p in problems:
            print(f"::error::{p}", file=sys.stderr)
        print(f"콘텐츠 린트 실패: {len(problems)}건", file=sys.stderr)
        return 1
    n = len((actions.get("actions") or []))
    ev = 0
    if events_path.exists():
        ev = len(json.loads(events_path.read_text(encoding="utf-8")).get("events") or [])
    print(f"콘텐츠 린트 통과. 액션 {n}개, 이벤트 {ev}개 검사.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
