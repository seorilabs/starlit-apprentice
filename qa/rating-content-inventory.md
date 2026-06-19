# Rating Content Inventory

This file is generated from product-core content data, app spec, store configs, and `qa/release-artifact-manifest.json`.

It is not a final rating certificate. Use it as repo-local evidence when completing AppsInToss game rating, Google Play content rating/Korea game rating, and App Store age rating console flows.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |

## Content Scope

| Field | Value |
| --- | --- |
| Archetype | `game` |
| Game loop | 12 months, 4 weekly actions per month |
| Schedule actions | 19 |
| Endings | 30 |
| Stats | 지성, 감성, 예법, 기술, 체력, 평판, 집중, 매력, 담력, 공감, 장사, 별감응, 리더십, 창의 |
| Storage | `local-only` |
| Excluded MVP scope | `login`, `payment`, `server-save`, `production-ads`, `remote-js-update` |

## Action Categories

| Category | ID | Count | Actions |
| --- | --- | ---: | --- |
| 수업 | `lesson` | 6 | 문장학, 음악, 예법, 공예, 별빛학, 체력훈련 |
| 일 | `work` | 6 | 도서관 보조, 찻집 서빙, 공방 심부름, 정원관리, 극장 스태프, 서기관 보조 |
| 휴식 | `rest` | 3 | 집에서 쉬기, 늦잠, 온천권 사용 |
| 외출 | `outing` | 4 | 시장, 광장, 도서관, 공원 |

## Rating Questionnaire Evidence

| Topic | Repo-local evidence | Console boundary |
| --- | --- | --- |
| Violence / combat | No combat system, damage loop, weapons, blood, or battle actions in product-core action/endings text. | Complete the official store questionnaire; do not rely on this file as the final rating. |
| Sexual content / romance | MVP excludes marriage-ending and family-romance scope; no sexual or romance copy is present in generated content corpus. | Complete the official store questionnaire. |
| Gambling / loot boxes | No paid chance mechanic, casino, betting, loot box, IAP, or payment SDK; `gold` is local-only progression currency. | Confirm store-specific gambling/chance questions in console. |
| Alcohol / tobacco / drugs | No alcohol, tobacco, or drug content appears in product-core action/endings text. | Confirm store-specific substance questions in console. |
| Horror / graphic content | No horror, gore, graphic injury, or jump-scare content appears in product-core action/endings text. | Confirm store-specific questionnaire wording in console. |
| User-generated content / chat | No UGC, chat, accounts, network play, or user-to-user communication in MVP scope. | Confirm interactive elements/social questions in console. |
| Data / tracking / ads | Store configs and privacy evidence state no collected/shared data, no tracking, no production ad SDK, no billing SDK. | Submit Play/App Store privacy declarations separately. |

## Repo-Local Answer Snapshot

This snapshot is generated from current repo content and config. It is intended to reduce console entry mistakes, not to replace the official AppsInToss, Google Play, or App Store rating questionnaires.

| Topic | Current repo-local posture | Source fields |
| --- | --- | --- |
| Combat, violence, weapons, blood, gore | Not present in current product-core content; answer as absent unless console wording requires a narrower interpretation. | `Risk Keyword Scan: Violence / combat`, `spec.mvp.excluded` |
| Sexual content, nudity, romance, marriage reward | Not present; MVP explicitly excludes marriage-ending and family-romance scope. | `Risk Keyword Scan: Sexual / romance`, `planning excluded scope` |
| Gambling, loot boxes, paid chance mechanics | Not present; no payment/IAP path and no paid chance mechanic. `gold` is local progression currency only. | `spec.mvp.excluded`, `googlePlay.contentDeclarations.ads` |
| Ads, tracking, advertising identifier | No production ads, tracking, or IDFA use in the MVP config. | `googlePlay.contentDeclarations.ads`, `appStore.reviewDeclarations.advertisingIdentifier`, `spec.mvp.excluded` |
| Data collection, sharing, account deletion | No user data collected/shared; no account system; local progress only. | `googlePlay.contentDeclarations.dataSafety`, `appStore.reviewDeclarations.privacyNutritionLabels`, `spec.mvp.storage` |
| UGC, chat, multiplayer, user-to-user communication | Not present; no account, server save, network play, chat, or UGC system in MVP scope. | `spec.mvp.excluded`, `spec.mvp.storage` |
| Substances, horror, graphic injury | Not present in current content corpus. | `Risk Keyword Scan: Substances`, `Risk Keyword Scan: Horror / fear` |
| Korea game rating evidence | Manual gate remains open; use this inventory as content evidence, then record Play Console or rating-authority evidence. | `googlePlay.contentDeclarations.koreaDistribution`, `googlePlay.contentDeclarations.koreaGameRating`, `appsInToss.manualEvidence.gameRatingEvidence` |

## Store Config Cross-Check

| Target | Field | Current value |
| --- | --- | --- |
| AppsInToss | appType | `game` |
| AppsInToss | gameRatingEvidence | 확정 필요 |
| Google Play | appType | `game` |
| Google Play | contentRating | 확정 필요 - IARC 및 한국 게임 등급 증빙 필요 |
| Google Play | koreaGameRating | 확정 필요 - Play Console 또는 게임물관리위원회 증빙 필요 |
| Google Play | ads | `no` |
| Google Play | targetAudience | `general-audience-not-children` |
| App Store | category | Games / Simulation / Role Playing |
| App Store | ageRating | 확정 필요 - App Store Connect 연령 등급 설문 입력 필요 |
| App Store | advertisingIdentifier | `no` |

## Risk Keyword Scan

The scanner checks product-core action text, ending text, and store listing text. Any match makes this inventory fail so the rating posture is reviewed intentionally.

| Area | Patterns | Matches | Evidence |
| --- | --- | ---: | --- |
| Violence / combat | `전투`, `던전`, `폭력`, `공격`, `무기`, `혈액`, `유혈`, `잔혹`, `battle`, `weapon`, `blood`, `gore`, `violence` | 0 | none |
| Sexual / romance | `성적`, `노출`, `연애`, `로맨스`, `결혼`, `키스`, `sexual`, `nudity`, `romance`, `marriage` | 0 | none |
| Gambling / chance monetization | `도박`, `카지노`, `베팅`, `슬롯`, `확률형`, `뽑기`, `loot box`, `casino`, `betting`, `gambling` | 0 | none |
| Substances | `주류`, `음주`, `담배`, `마약`, `alcohol`, `tobacco`, `drug` | 0 | none |
| Horror / fear | `공포`, `귀신`, `괴물`, `horror`, `ghost`, `monster` | 0 | none |

## Content Corpus

| Corpus | Count |
| --- | ---: |
| Action labels/descriptions/places | 19 |
| Ending titles/summaries/share text/hints | 30 |
| Store listing locales | 2 |

## Required Manual Rating Gates

- AppsInToss game rating evidence remains a console/reviewer gate.
- Google Play content rating and Korea game rating evidence remain console/reviewer gates.
- App Store age rating remains an App Store Connect gate.
- If any official questionnaire answer conflicts with this inventory, update repo content/configs or record the console-specific reason before release.
