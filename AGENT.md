# starlit-apprentice Agent Guide

## 기본 원칙

- 한글을 주 사용언어로 하고, 답변은 간결하고 실무적으로 한다.
- 애매한 값은 추측하지 말고 확인하거나 `확정 필요`로 둔다.
- 사용자의 전제나 기술적 판단이 틀리면 바로잡는다.
- 설명이 복잡하면 Mermaid 등 도식화를 사용한다.

## Source of Truth

- Obsidian 프로젝트 허브: `프로젝트/starlit-apprentice/README.md`
- 현재 기획 기준: `프로젝트/앱 제작 공장/기획 인박스/starlit-apprentice 최초 기획서.md`
- 개인 로컬 절대경로는 `AGENT.local.md`에서만 관리한다.
- `AGENT.local.md`가 있으면 먼저 읽고, 없으면 이 파일과 repo 상태만 기준으로 작업한다.

현재 라이프사이클은 `qa`다. playable MVP 구현, agent QA, 초도 등록 이미지와 Play/App Store 등록 자산 생성은 완료했고, 사람 테스트와 콘솔별 출시 검증은 아직 남아 있다.

## 제품 경계

- 앱 이름 후보: `별빛 견습생` / `Star Apprentice`
- app-id 후보: `starlit-apprentice`
- 앱 유형: 픽셀 아트 장기 육성 시뮬레이션 게임
- 현재 구현: 1년, 12개월, 월 4주 일정, 30엔딩
- 구현 스택: Canvas renderer + Vite + TypeScript + Capacitor
- AppsInToss 타깃: Vite 정적 WebView 빌드
- Google Play/App Store 타깃: Capacitor bundled-web shell

금지 범위:

- 원작명, 원작 캐릭터, 원작 UI, 원작 이벤트, 원작 엔딩 직접 복제
- 무사수행, 던전 탐험, 랜덤 전투
- 결혼 엔딩 중심 구조
- 미성년자 성적 대상화 또는 가족 로맨스
- 초기 버전의 로그인, 결제, 서버 저장, 민감정보 수집

## Repo 방향

```text
apps/starlit-apprentice
packages/product-core
apps-in-toss/
play-store/
app-store/
```

게임 로직, 저장 모델, 콘텐츠 데이터는 가능하면 platform adapter 밖의 core 영역에 둔다. AppsInToss, Google Play, App Store 관련 값은 출시 타깃별 문서와 설정으로 분리한다.

## 검증

고정 명령:

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm assets:generate:registration
pnpm assets:generate:stores
pnpm assets:sync:ios-icons
pnpm assets:generate
pnpm assets:sync:android-icons
pnpm assets:sync:native-splash
pnpm build:android:qa-apk
pnpm build:android:aab
pnpm build:ios:release
pnpm build:apps-in-toss:ait
pnpm build:apps-in-toss:candidate
pnpm release:artifact-manifest
pnpm release:manual-qa-packet
pnpm release:console-packet
pnpm release:rating-content-inventory
pnpm release:public-pages
pnpm release:store-submission-packet
pnpm release:gate-dashboard
pnpm release:approval-packet
pnpm check:architecture
pnpm check:assets
pnpm check:store-config
pnpm check:store-config:strict
pnpm check:versioning
pnpm check:webview-security
pnpm check:native-bundle-sync
pnpm check:privacy
pnpm check:analytics-contract
pnpm check:third-party-notices
pnpm check:android:icons
pnpm check:native-splash
pnpm check:android:qa-apk
pnpm check:play
pnpm check:play:local-artifact
pnpm check:play:strict
pnpm check:app-store
pnpm check:app-store:local-artifact
pnpm check:app-store:strict
pnpm check:apps-in-toss
pnpm check:apps-in-toss:strict
pnpm check:manual-qa
pnpm check:manual-qa:strict
pnpm check:release-console-packet
pnpm check:release-console
pnpm check:release-console:strict
pnpm check:rating-content-inventory
pnpm check:public-pages
pnpm check:store-submission-packet
pnpm check:release-gate-dashboard
pnpm check:release-approval-packet
pnpm check:release-approval
pnpm check:release-approval:strict
pnpm check:content
pnpm check:save-contract
pnpm check:target-guidance
pnpm check:balance
pnpm check:pacing
pnpm check:runtime
pnpm check:ui-accessibility
pnpm check:bundle-budget
pnpm check:package
pnpm check:release-verification-commands
pnpm check:release-manual-blockers
pnpm check:public-url-guard
pnpm check:release-artifact-manifest
pnpm check:manual-qa-packet
pnpm check:release-packages
pnpm check:release:automated
pnpm check:release -- --allow-manual-blockers
pnpm test:e2e
pnpm qa
pnpm cap:sync
```

예상 QA 기준:

- 모바일 390 x 844, 작은 모바일 360 x 740
- 새 게임/이어하기 CTA
- 일정 12개월 진행
- 엔딩 도달
- 공유 URL query 진입
- 긴 텍스트 overflow
- 이미지/광고 fallback
