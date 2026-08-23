# P3 Godot 골격 실행 기록

- 날짜: 2026-08-23
- 단계: P3 (Godot 골격)
- 관련: [[../02-decisions/0003-runtime-default-font]] · [[../02-decisions/0006-pck-budget]] · [[../02-decisions/0007-font-budget]]

## 만든 것

| 항목 | 내용 |
|---|---|
| 엔진 핀 | `.godot-version` = `4.7.1.stable` |
| `project.godot` | 레포 루트. 720×1280 세로 고정, `canvas_items`/`expand`, `mobile` 렌더러, ETC2/ASTC |
| autoload 6종 | `Events` → `Ui` → `GameData` → `Platform` → `Profile` → `Audio` (순서 = 로드 순서) |
| `packages/product-core` | 순수 GDScript. `SaStatKeys`(스탯 9종), `SaGrowthCurve`(분기 상한), 포트 3종 |
| 테스트 | `tests/core_test_runner.gd`, `tests/test_runner.gd` (스모크) |
| 게이트 | `scripts/godot_quality_gate.sh`, `scripts/ensure_godot.sh`, `scripts/check_web_budget.sh`, `tools/check_core_boundary.py` |
| 폰트 | `assets/fonts/Pretendard-Regular.ttf` (SIL OFL 1.1) |

## 검증 결과

| # | 검증 | 결과 |
|---|---|---|
| 1 | **fresh 체크아웃 게이트 1회차** (`rm -rf .godot`) | **exit=0, 로그에 `ERROR:` 없음** |
| 2 | 게이트 2회차 | exit=0 |
| 3 | 코어 순수 테스트 | `CORE TESTS PASS` |
| 4 | 스모크 (autoload 6종 + 메인 씬 + 폰트 부착) | `SMOKE PASS` |
| 5 | 코어 경계 | 통과, 코어 파일 6개 검사 |
| 6 | Web export | 성공 |
| 7 | **출하 pck 구동 폰트 검증** | **폰트 경고 없음 — pck 안에서 Theme 부착 성공** |
| 8 | 전송 예산 | **통과** |

**1회차가 깨끗하다는 것이 핵심이다.** ADR-0003 대로 `project.godot` 에 폰트를 지정하지 않고 autoload 가 import 이후에 붙였기 때문이다. 2회차만 보면 이 검증은 무의미하다.

## Web export 실측 (R16 부분 해소)

빈 프로젝트 + 폰트만. `variant/thread_support=false`.

| 파일 | raw | gzip |
|---|---:|---:|
| `index.wasm` | 37.68 MB | **9.64 MB** |
| `index.pck` | 1.47 MB | **1.45 MB** |
| `index.js` | 0.26 MB | 0.06 MB |
| 기타 | — | 0.01 MB |
| **합계** | **39.46 MB** | **11.20 MB** |

| 예산 | 상한 | 현재 | 여유 |
|---|---:|---:|---:|
| 총 전송량 | 15.00 MB | **11.20 MB** | 3.80 MB |
| pck | 6.00 MB | **1.45 MB** | **4.55 MB** |

**엔진 wasm gzip 9.64 MB 가 고정 바닥값**이라 총 예산의 64% 를 엔진이 쓴다. 이는 org 다른 게임 실측(8.9~9.6 MB)과 일치하고 Godot 공식 문서의 "`.wasm` 은 gzip 으로 약 1/4" 서술과도 맞는다.

### 따라오는 제약

**폰트가 현재 pck 의 77% 다** (1.11 / 1.45 MB gzip). 아트 152종 · BGM 3종 · 스팅어 4종 · 콘텐츠 JSON 전부가 남은 **4.55 MB gzip** 을 나눠 써야 한다.

> **오디오 예산을 에셋 생성 전에 확정해야 한다.** BGM 3종을 각 90초 `.ogg` 로 만들면 2~3 MB 가 되어 남은 여유의 절반 이상을 먹는다. 비트레이트·길이·모노 여부를 `04-art-audio-bible.md` 에 수치로 못박는다.

## 여전히 열려 있는 것

| # | 항목 | 왜 아직 못 닫았나 |
|---|---|---|
| **R16** | AIT 최초 화면 10초 이내 | **크기 예산은 통과했으나 실제 로드 시간은 실기기 QR 샌드박스에서만 측정된다.** 크기가 작다는 것이 10초를 만족한다는 증명은 아니다 |
| **R17** | AIT iOS WebKit 렌더 | Godot 공식 문서가 Safari WebGL 2.0 문제를 명시한다. Android 통과가 iOS 통과를 의미하지 않는다 |
| R11 | `ensure_godot.sh` 가 `~/.local/bin/godot` 심볼릭 링크를 덮어쓴다 | 코드로 확인됨(`ln -sf`). 로컬은 `GODOT_BIN` 으로 우회했다. CI 는 fresh 러너라 무해 |

R16·R17 은 `apps/ait` 래퍼(P9)가 생겨 `.ait` 를 만들 수 있을 때 측정한다. **콘텐츠를 대량 저작하기 전에 측정하는 것이 이 단계의 목적이었고, 크기 예산은 확보됐다.**

## 사용한 명령

```bash
export GODOT_BIN=/tmp/godot-4.7.1-stable-macos/Godot.app/Contents/MacOS/Godot
rm -rf .godot
bash scripts/godot_quality_gate.sh --project . --godot-bin "$GODOT_BIN"   # 두 번 실행한다
"$GODOT_BIN" --headless --path . --script res://tests/core_test_runner.gd
"$GODOT_BIN" --headless --path . --script res://tests/test_runner.gd
python3 tools/check_core_boundary.py .
"$GODOT_BIN" --headless --path . --export-release Web build/web/index.html
bash scripts/check_web_budget.sh .
```
