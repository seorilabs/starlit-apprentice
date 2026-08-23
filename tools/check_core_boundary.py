#!/usr/bin/env python3
"""product-core 의 의존 경계 검사기.

`packages/product-core` 는 엔진과 마켓 SDK 를 알지 못하는 순수 로직이어야 한다.
이 게임에서 그 경계가 특히 중요한 이유가 있다. iOS Kids 빌드는 광고·분석·크래시 SDK 를
아예 링크하지 않는다. 코어가 SDK 타입이나 엔진 싱글턴을 직접 알고 있으면 그 분기가 성립하지 않는다.

이 검사기가 grep 한 줄을 대신하는 이유:

  GDScript 에는 `import` 도 `require` 도 없다. 의존은 세 가지 통로로 들어온다.
    1. `extends` 로 엔진 타입을 상속
    2. `preload()` / `load()` 로 다른 스크립트를 끌어옴
    3. 싱글턴을 그냥 이름으로 부름 — `Firebase.Analytics.log()`, `OS.get_name()`

  정규식 하나로는 3번을 잡을 수 없고, 잡으려 하면 주석과 문자열의 한국어 설명에 걸린다.
  그래서 여기서는 주석과 문자열 리터럴을 먼저 걷어낸 뒤 코드만 본다.
"""
import os
import re
import sys

CORE_DIRS = [
    "packages/product-core/src",
    "packages/product-core/tests",
]

# 코어가 상속해도 되는 것. RefCounted 는 씬 트리에 붙지 않는 참조 카운트 객체다.
ALLOWED_BASES = {"RefCounted", "Object"}

# 이름만 불러도 의존이 생기는 것들.
FORBIDDEN_IDENTIFIERS = {
    # 마켓 / 백엔드 / 광고 SDK
    "Firebase", "Firestore", "FirebaseAuth", "FirebaseAnalytics", "Crashlytics",
    "AdMob", "GodotAdMob", "StoreKit", "BillingClient", "AppsInToss", "Toss",
    # 엔진 씬 트리와 런타임
    "Node", "Node2D", "Control", "SceneTree", "Window", "Viewport", "CanvasItem",
    "Timer", "Tween", "Engine", "Input", "DisplayServer", "JavaScriptBridge",
    # 파일 / 설정 / 시계 — 코어는 이것들을 직접 만지지 않는다
    "FileAccess", "DirAccess", "ResourceLoader", "ResourceSaver", "ProjectSettings",
    "OS", "Time", "JSON",
}

# 함수 형태로 들어오는 의존
FORBIDDEN_CALLS = ["preload", "load"]


def strip_comments_and_strings(source: str) -> str:
    """주석과 문자열 리터럴을 공백으로 바꾼다.

    한국어 설명은 대부분 주석과 문자열 안에 있다. 그것을 그대로 두면
    "Firebase Analytics 어댑터가 캡슐화한다" 같은 문장이 위반으로 잡힌다.
    """
    out = []
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        if ch == "#":
            while i < n and source[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if ch in ('"', "'"):
            quote = ch
            triple = source.startswith(quote * 3, i)
            closing = quote * 3 if triple else quote
            i += len(closing)
            out.append(" " * len(closing))
            while i < n:
                # 한 줄짜리 문자열은 줄이 끝나면 거기서 끊는다.
                # 닫는 따옴표를 못 찾았다고 파일 끝까지 지워 버리면, 그 뒤의 위반이
                # 통째로 안 보이게 된다. 검사기가 조용히 통과하는 것이 가장 나쁘다.
                if not triple and source[i] == "\n":
                    break
                if source[i] == "\\" and i + 1 < n:
                    out.append("  ")
                    i += 2
                    continue
                if source.startswith(closing, i):
                    out.append(" " * len(closing))
                    i += len(closing)
                    break
                out.append("\n" if source[i] == "\n" else " ")
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def check_file(path: str) -> list:
    raw = open(path, encoding="utf-8").read()
    code = strip_comments_and_strings(raw)
    problems = []

    # `\s` 는 개행까지 먹어서 다음 줄의 첫 식별자를 상속 대상으로 잡는다. 같은 줄만 본다.
    extends = re.findall(r"^[ \t]*extends[ \t]+([A-Za-z_][A-Za-z0-9_]*)", code, re.M)
    for base in extends:
        if base in ALLOWED_BASES:
            continue
        if base.startswith("Sa"):
            continue
        problems.append((0, f"코어가 '{base}' 를 상속한다. 순수 로직은 RefCounted 만 상속한다"))

    for index, line in enumerate(code.split("\n"), start=1):
        for name in sorted(FORBIDDEN_IDENTIFIERS):
            if re.search(r"\b%s\b" % re.escape(name), line):
                problems.append((index, f"'{name}' 를 코어에서 직접 부른다"))
        for call in FORBIDDEN_CALLS:
            if re.search(r"\b%s\s*\(" % re.escape(call), line):
                problems.append((index, f"'{call}()' 로 바깥 리소스를 끌어온다"))

    return problems


def main(root: str) -> int:
    os.chdir(root)
    missing = [d for d in CORE_DIRS if not os.path.isdir(d)]
    if missing:
        for d in missing:
            print(f"검사 대상 디렉터리가 없다: {d}", file=sys.stderr)
        return 1

    files = []
    for base in CORE_DIRS:
        for dirpath, _dirnames, filenames in os.walk(base):
            for name in sorted(filenames):
                if name.endswith(".gd"):
                    files.append(os.path.join(dirpath, name))

    if not files:
        print("코어에 검사할 .gd 파일이 하나도 없다. 빈 코어는 통과로 보지 않는다.", file=sys.stderr)
        return 1

    failures = 0
    for path in sorted(files):
        for line_no, message in check_file(path):
            location = f"{path}:{line_no}" if line_no else path
            print(f"FAIL {location} — {message}", file=sys.stderr)
            failures += 1

    if failures:
        print(
            f"\n경계 위반 {failures}건. 플랫폼 의존은 "
            f"packages/product-core/src/ports 의 포트를 통해서만 들어온다.",
            file=sys.stderr,
        )
        return 1

    print(f"경계 검사 통과. 코어 파일 {len(files)}개를 검사했다.")
    return 0


if __name__ == "__main__":
    repo_root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )
    sys.exit(main(repo_root))
