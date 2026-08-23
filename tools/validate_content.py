#!/usr/bin/env python3
"""콘텐츠 정적 린트.

시뮬레이션 없이 data/*.json 의 불변식을 검사한다. 모든 콘텐츠 PR 을 게이트한다.
설계 불변식 8·11·17 의 정적 검사 부분에 해당한다.
"""
from __future__ import annotations
import json
import re
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
notices: list[str] = []


def err(msg: str) -> None:
    problems.append(msg)


def warn(msg: str) -> None:
    """아직 저작 중이라 실패시킬 수 없지만 보이지 않으면 잊히는 것."""
    notices.append(msg)


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


# 어휘는 코어 소스에서 직접 뽑는다. 손으로 관리하면 반드시 낡고, 낡은 린트는
# 통과 표시를 내면서 아무것도 보장하지 않는다. 실제로 turn_skip 을 빠뜨렸다.
CORE = Path("packages/product-core/src")


def _core_text(rel: str, root: Path) -> str:
    path = root / CORE / rel
    if not path.exists():
        err(f"코어 파일을 찾지 못했다: {rel} — 어휘 검사를 할 수 없다")
        return ""
    return path.read_text(encoding="utf-8")


def core_vocabularies(root: Path) -> dict[str, set[str]]:
    """코어가 실제로 읽는 요건 타입·비용 키·효과 키를 소스에서 추출한다."""
    ev = _core_text("domain/event_requirements.gd", root)
    en = _core_text("domain/ending_requirements.gd", root)
    rc = _core_text("use_cases/resolve_event_choice.gd", root)
    st = _core_text("domain/stat_keys.gd", root)

    # match 문의 case 라벨
    event_types = set(re.findall(r'^\t\t"([a-z_]+)":$', ev, re.M))
    # const TYPE_X := "value"
    ending_types = set(re.findall(r'const TYPE_\w+ := "([a-z-]+)"', en))
    cost_keys = set(re.findall(r'cost\.get\("([a-z_]+)"', rc))
    effect_keys = set(re.findall(r'effects\.get\("([a-z_]+)"', rc))
    resource_keys = set(re.findall(r'out\["([a-z]+)"\] = int\(out\.get', rc)) | {"turn"}
    # const NAME := "value" 중 ALL 배열에 실제로 들어간 것만
    consts = dict(re.findall(r'const ([A-Z_]+) := "([a-z]+)"', st))
    # 배열 리터럴 안쪽만 본다. `Array[String]` 의 대괄호와 뒤따르는 상수를 함께
    # 긁으면 REPUTATION 이 스탯으로 섞인다 — 평판은 스탯이 아니다.
    tail = st.split("const ALL")[1] if "const ALL" in st else ""
    all_block = tail.split("= [", 1)[1].split("]")[0] if "= [" in tail else ""
    stats = {consts[n] for n in re.findall(r'\b([A-Z_]+)\b', all_block) if n in consts}

    missing = [n for n, s in [("이벤트 요건", event_types), ("엔딩 요건", ending_types),
                              ("비용 키", cost_keys), ("효과 키", effect_keys)] if not s]
    for n in missing:
        err(f"코어에서 {n} 어휘를 추출하지 못했다 — 린트가 무력화된 상태다")
    return {"event": event_types, "ending": ending_types, "cost": cost_keys,
            "effect": effect_keys, "resource": resource_keys, "stats": stats or set(STATS)}


def check_requirement_types(events: dict, endings: dict, vocab: dict) -> None:
    def scan(reqs: object, where: str, allowed: set[str]) -> None:
        if not isinstance(reqs, list):
            return
        for r in reqs:
            if not isinstance(r, dict):
                continue
            kind = str(r.get("type") or "")
            if kind not in allowed:
                err(f"{where}: 코어가 모르는 요건 타입 '{kind}' — 이 조건은 영원히 거짓이다")
                continue
            if kind == "stat" and r.get("stat") not in vocab["stats"]:
                err(f"{where}: 모르는 스탯 요건 '{r.get('stat')}'")
            if kind == "resource" and r.get("resource") not in vocab["resource"]:
                err(f"{where}: 모르는 자원 요건 '{r.get('resource')}'")

    for e in (events.get("events") or []):
        where = f"이벤트 '{e.get('id')}'"
        scan(e.get("requirements"), where, vocab["event"])
        scan(e.get("exclusions"), where, vocab["event"])
        for c in (e.get("choices") or []):
            scan(c.get("requirements"), f"{where} 선택지 '{c.get('id')}'", vocab["event"])
    for e in (endings.get("endings") or []):
        scan(e.get("requirements"), f"엔딩 '{e.get('code')}'", vocab["ending"])


def check_effect_keys(events: dict, vocab: dict) -> None:
    """코어가 읽지 않는 키는 조용히 무시된다. "stats2" 오타가 효과를 통째로 날려도
    에러가 나지 않으므로 여기서 잡는다."""
    for e in (events.get("events") or []):
        for c in (e.get("choices") or []):
            where = f"이벤트 '{e.get('id')}' 선택지 '{c.get('id')}'"
            for k in (c.get("cost") or {}):
                if k not in vocab["cost"]:
                    err(f"{where}: 코어가 읽지 않는 비용 키 '{k}'")
            for o in (c.get("outcomes") or []):
                eff = o.get("effects") or {}
                for k in eff:
                    if k not in vocab["effect"]:
                        err(f"{where}: 코어가 읽지 않는 효과 키 '{k}' — 조용히 무시된다")
                for s in (eff.get("stats") or {}):
                    if s not in vocab["stats"]:
                        err(f"{where}: 모르는 스탯 '{s}'")


def check_decks(events: dict) -> None:
    """기회 이벤트는 회차마다 다른 덱이 열린다. 덱이 비거나 기울면
    어떤 회차는 기회 이벤트가 거의 없는 채로 끝난다."""
    opp = [e for e in (events.get("events") or []) if e.get("category") == "opportunity"]
    if not opp:
        return
    counts: Counter = Counter()
    for e in opp:
        deck = e.get("deck")
        if deck is None:
            err(f"기회 이벤트 '{e.get('id')}' 에 deck 이 없다")
        else:
            counts[int(deck)] += 1
    if not counts:
        return
    if sorted(counts) != [0, 1, 2]:
        err(f"기회 덱이 0·1·2 세 개가 아니다: {sorted(counts)}")
    if max(counts.values()) - min(counts.values()) > 1:
        err(f"기회 덱 분량이 기울었다: {dict(sorted(counts.items()))}")


def check_event_escape(events: dict) -> None:
    """모든 이벤트에 언제나 고를 수 있는 선택지가 하나는 있어야 한다.

    요건도 비용도 없는 선택지가 없으면 자원이 바닥난 상태에서 그 이벤트가
    뜨는 순간 진행이 막힌다. 시뮬레이션이 npc.gu.03 에서 실제로 걸렸다.
    """
    for e in (events.get("events") or []):
        escapes = 0
        for c in (e.get("choices") or []):
            if c.get("requirements"):
                continue
            cost = c.get("cost") or {}
            if int(cost.get("gold", 0)) < 0 or int(cost.get("energy", 0)) < 0:
                continue
            escapes += 1
        if escapes == 0:
            err(f"이벤트 '{e.get('id')}': 언제나 고를 수 있는 선택지가 없다 — 자원이 바닥나면 막힌다")


def check_event_art(root: Path, events: dict, npcs: dict) -> None:
    """UI 가 빈 그림을 그리는 상황을 데이터에서 막는다. 액션 아이콘과 같은 규칙."""
    art_dir = root / "assets" / "art"
    have = {p.stem for p in art_dir.glob("*.webp")} | {p.stem for p in art_dir.glob("*.png")}
    if not have:
        err("assets/art 에 아트가 없다")
        return
    for e in (events.get("events") or []):
        key = str(e.get("art_key") or "")
        if not key:
            err(f"이벤트 '{e.get('id')}' 에 art_key 가 없다")
        elif key not in have:
            err(f"이벤트 '{e.get('id')}': 없는 아트 '{key}'")
    for n in (npcs.get("npcs") or []):
        key = str(n.get("art_key") or "")
        if key and key not in have:
            err(f"NPC '{n.get('id')}': 없는 아트 '{key}'")


def check_npcs(doc: dict, actions: dict, events: dict, endings: dict) -> set[str]:
    """NPC 원장을 검사하고, 참조 검사에 쓸 id 집합을 돌려준다."""
    npcs = doc.get("npcs") or []
    if not npcs:
        err("data/npcs.json 에 npcs 가 비어 있다")
        return set()
    ids: set[str] = set()
    for n in npcs:
        nid = str(n.get("id") or "")
        if not nid:
            err("NPC 에 id 가 없다")
            continue
        if nid in ids:
            err(f"NPC id 중복: {nid}")
        ids.add(nid)
        for field in ("name", "role", "art_key", "blurb"):
            if not str(n.get(field) or "").strip():
                err(f"NPC '{nid}' 의 {field} 가 비어 있다")
        if not (n.get("stats") or []):
            err(f"NPC '{nid}' 에 담당 스탯이 없다")
        for s in (n.get("stats") or []):
            if s not in STATS:
                err(f"NPC '{nid}' 가 모르는 스탯을 담당한다: {s}")

    # 참조 무결성. 없는 NPC 를 가리키면 호감이 영원히 0 이라 게이트가 조용히 잠긴다.
    def scan(node: object, where: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("npc", "npc_id", "npc_tag") and isinstance(v, str) and v:
                    if v not in ids:
                        err(f"{where}: 등록되지 않은 NPC 참조 '{v}'")
                elif k == "affinity" and isinstance(v, dict):
                    for target in v:
                        if target not in ids:
                            err(f"{where}: 등록되지 않은 NPC 호감 '{target}'")
                else:
                    scan(v, where)
        elif isinstance(node, list):
            for item in node:
                scan(item, where)

    for e in (events.get("events") or []):
        scan(e, f"이벤트 '{e.get('id')}'")
    for a in (actions.get("actions") or []):
        scan(a, f"액션 '{a.get('id')}'")
    for e in (endings.get("endings") or []):
        scan(e, f"엔딩 '{e.get('code')}'")

    # 체인 임계값마다 이벤트가 실제로 있어야 NPC 투자에 보상이 생긴다.
    thresholds = doc.get("chain_thresholds") or []
    for nid in sorted(ids):
        have = set()
        for e in (events.get("events") or []):
            if e.get("category") != "npc":
                continue
            for r in (e.get("requirements") or []):
                if r.get("type") == "affinity" and r.get("npc") == nid:
                    have.add(int(r.get("target", 0)))
        missing = [t for t in thresholds if not any(abs(h - t) <= 5 for h in have)]
        if missing:
            warn(f"NPC '{nid}' 체인에 이벤트가 없는 호감 구간: {missing}")
    return ids


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    actions = load(root, "actions.json")
    if actions:
        check_actions(actions)
    events_path = root / "data" / "events.json"
    if events_path.exists():
        check_events(json.loads(events_path.read_text(encoding="utf-8")))
    endings_path = root / "data" / "endings.json"
    endings_doc: dict = {}
    if endings_path.exists():
        endings_doc = json.loads(endings_path.read_text(encoding="utf-8"))
        check_endings(endings_doc)
    events_for_types = json.loads(events_path.read_text(encoding="utf-8")) if events_path.exists() else {}
    vocab = core_vocabularies(root)
    check_requirement_types(events_for_types, endings_doc, vocab)
    npcs_path = root / "data" / "npcs.json"
    if npcs_path.exists():
        events_doc = json.loads(events_path.read_text(encoding="utf-8")) if events_path.exists() else {}
        npcs_doc = json.loads(npcs_path.read_text(encoding="utf-8"))
        check_npcs(npcs_doc, actions or {}, events_doc, endings_doc)
        check_event_art(root, events_doc, npcs_doc)
    else:
        err("data/npcs.json 이 없다")
    check_decks(events_for_types)
    check_event_escape(events_for_types)
    check_effect_keys(events_for_types, vocab)

    if problems:
        for p in problems:
            print(f"::error::{p}", file=sys.stderr)
        print(f"콘텐츠 린트 실패: {len(problems)}건", file=sys.stderr)
        return 1
    n = len((actions.get("actions") or []))
    ev = 0
    if events_path.exists():
        ev = len(json.loads(events_path.read_text(encoding="utf-8")).get("events") or [])
    for m in notices:
        print(f"  경고: {m}")
    print(f"콘텐츠 린트 통과. 액션 {n}개, 이벤트 {ev}개 검사.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
