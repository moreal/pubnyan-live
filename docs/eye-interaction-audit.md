# 눈동자 및 인터랙션 전수조사 — 2026-09-12

조사 기준: `742e74e` (`fix(animation): clip pupils to animated eye apertures`).
최초 요청은 조사였으며, 후속 요청으로 모션·리그·exporter 수정까지 진행했다. backlog와 커밋은 변경하지 않았다.

## 수정 상태

사용자의 후속 수정 요청에 따라 아래 조사 항목을 구현했다.

- Rive의 drawing opacity와 표정 geometry visibility/정점을 분리했다. 반응은 현재 표정의 pupil을 보존한다.
- normal 눈은 원본 outer white와 비대칭 pupil 경로를 정렬한 뒤 `rig:extract`로 복원했다.
- 직접 Rive 표정 전환은 0.4초 내부 bridge로 교체했다. 눈이 닫힌 사이 `closed` 도형을 거쳐 교체하므로 진행 중인 반응도 눈을 되살릴 수 없다.
- celebrate는 원본 눈과 happy 눈의 비호환 도형을 닫힌 구간에 교체한다. curious의 효과 없는 pupil 이동 트랙은 제거했다.
- 반응/표정 조합, 반응 중 표정 전환, bridge 중 최신 표정 요청의 최종 도착, 원본 경로 보존을 회귀 검사에 추가했다.
- 20개 내부 연결 동작을 포함한 Rive 묶음은 4,173,567바이트에서 11,522,459바이트로 증가했다.
- dotLottie의 단일 애니메이션 상태 머신 변환은 기존 제약을 유지한다. 이번 내부 bridge는 Rive 전용이며 공개 입력/클립 목록은 바꾸지 않았다.

[수정 후 wink 조합](../dist/verify/audit-react.png) · [수정 후 표정 전환](../dist/verify/audit-transitions-normal.png) · [수정 후 독립 wink](../dist/verify/wink-review.png)

최종 검증 완료: `npm run check:types` 통과, `npm test` 49개 파일·346개 테스트 통과, `npm run verify` 종료 코드 0 및 84개 비교 모두 PASS·skipped 없음. 영상 내보내기와 dotLottie 번들 검사도 통과했다. 고양이 21개 클립의 4개 렌더러 비교 이미지, Rive 35개 반응 조합, 20개 직접 표정 전환, 내부 bridge 20개의 contact sheet를 확인했다. 아래는 수정 이전의 조사 기록이다. 수정 전 이미지는 `dist/verify/before-eye-fixes/`에도 보존했다.

## 결론

**수정 필요(Block).** Rive 상태 머신에서 현재 표정의 눈동자 대신 기본 눈동자를 적용하는 결함을 재현했다. `wink`, `nod`, `ring-wobble`, `tail-flick`에 공통으로 발생한다. 원본 normal 눈 도형이 합성 타원으로 교체되어 있는 문제와, 표정 전환 중 서로 다른 눈 윤곽을 겹쳐 표시하는 문제도 구분해서 다뤄야 한다.

| 현재 동작(Before) | 수정 방향(After, 미구현) | 이유(Why) |
| --- | --- | --- |
| **P1:** Rive에서 wink·nod·ring-wobble·tail-flick의 pupil opacity 트랙이 기본 pupil 도형과 visibility까지 덮어쓴다. | 반응의 투명도와 표정의 도형 선택을 별도 채널/노드로 분리한다. shape 트랙 없는 반응은 도형·표정별 visibility·정점을 키잉하지 않게 한다. | angry·curious·shy는 원래 별도 pupil이 없는데 반응 중 나타난다. cry는 원래 pupil이 normal 도형으로 바뀐다. |
| **P2:** normal의 원본 눈과 눈동자 경로를 새 타원 경로로 대체했다. | 원본 경로와 정렬을 보존한 리그를 추출하고, 기존 aperture clipping을 적용한다. | 원래 그림의 기울기와 비대칭이 없어져 다른 눈을 붙인 인상을 준다. wink뿐 아니라 normal을 사용하는 모든 클립에 공통이다. |
| **P2:** Rive의 직접 표정 전환은 열린 눈끼리 crossfade한다. | 현재 표정에서 출발하는 blink로 도형 교체를 가리거나, 원본 윤곽을 유지하는 호환 morph를 설계한다. | 50–200ms 중간 프레임에서 이전/다음 눈·입이 회색으로 겹친다. standalone to/from 클립의 closed-blink 처리를 상태 머신은 사용하지 않는다. |
| **P3:** expr-curious는 존재하지 않는 pupil의 위치를 애니메이션한다. | 원본 윤곽 기반 시선 표현으로 다시 설계하거나 효과 없는 트랙을 제거한다. | curious pupil은 null이므로 “눈동자가 먼저 움직인다”는 트랙은 실제 시선을 움직이지 않는다. white 이동은 남아 있다. |

## 재현과 원인

### 1. 표정 위에 반응을 겹칠 때 기본 눈동자가 다시 나타남

- `motion/clips/wink.clip.ts:19`: 오른쪽 pupil opacity를 키잉한다.
- `motion/clips/expression-motion.ts:30`: 공통 blink가 양쪽 pupil opacity를 키잉한다. nod와 ring-wobble, 그 alias인 tail-flick이 사용한다.
- `packages/export-rive/src/machine.ts:369`: partial 반응이라도 opacity 트랙이 있으면 geometry 처리에 진입한다.
- 같은 파일 `379`: shape 트랙이 없는 상태에서 `sampleShape()`를 호출해 default 도형을 선택한다.
- 같은 파일 `390`: 선택한 default geometry의 opacity를 기록한다.
- 같은 파일 `405` 및 `416`: 정점도 키잉한다. 따라서 “투명도만 변경”이 아니라 표정의 도형 선택/정점까지 덮어쓴다.

재현: Rive 머신에서 expression을 angry(1), curious(2), cry(3), shy(4) 중 하나로 설정하고 1초 진행한 뒤 반응을 실행한다. wink는 +0.6초, nod는 +0.5초, ring-wobble/tail-flick은 +0.6초에서 확인했다. wink는 오른쪽, 나머지는 양쪽에 영향을 준다.

진단에서는 메모리 안에서 pupil만 빨강으로 바꾸었다. 대조군은 다른 트랙과 타이밍을 모두 유지하고 해당 반응의 pupil opacity 트랙만 제외했다. angry·curious·shy에서 실제 버전에만 빨간 pupil이 나타났고, cry는 모양이 달라졌다. 이 대조군은 원인 격리용이며 완성된 수정안은 아니다.

- [실제 화면과 대조군](../dist/verify/before-eye-fixes/audit-pupil-probe.png)
- [픽셀 차이 수치](../dist/verify/audit-pupil-probe.json)
- [원래 색상 wink 조합](../dist/verify/before-eye-fixes/audit-react.png)

동일 대조 실험에서 tilt와 ear-twitch는 네 비기본 표정 모두 픽셀 차이 0이었다. 네 문제 반응은 네 표정 모두 차이가 발생했다. 전체 화면 대비 차이는 작지만 눈 영역의 의미 있는 변화다.

### 2. 원본 normal 눈을 그대로 사용하는 것은 아님

`rig/parts.map.json:146`에 원본 pupil `path21`/`path19`가 매핑되어 있으나, `151–156`의 overrides가 whites와 pupils를 모두 대체한다. 실제 경로는 `rig/overrides/pubnyan-eyes-mouth.svg:31`의 `pupil-l-normal`과 `pupil-r-normal` 등이다.

원본 normal 눈 네 경로만 코 중심에 맞춰 메모리 리그에 이식한 비교에서 기울기와 윤곽 차이를 확인했다. 별도 pupil을 제거한 현재 리그는 흰 눈만 남았다. **normal 정지 리그에 원래 검은 pupil이 중복으로 박혀 있는 것은 아니다.** “새로 만든 도형을 사용함”과 “Rive 반응이 다른 도형을 다시 적용함”이 서로 다른 문제다.

- [현재 / 원본 눈 경로 / pupil 제거 비교](../dist/verify/before-eye-fixes/audit-source.png)

### 3. 직접 표정 전환의 겹침

`motion/machine.ts:39` 부근의 expression transitions는 지속 표정 클립 간 0.24–0.4초 blend를 사용한다. `to-*`/`from-*` 클립은 이 경로에서 호출되지 않는다. 서로 다른 표정 5개 간 방향 있는 전환 20개를 모두 렌더링했다. 특히 normal↔cry, normal↔shy에서 겹치는 윤곽이 뚜렷하며, 눈뿐 아니라 입에도 crossfade가 보인다.

- [normal에서 다른 표정](../dist/verify/before-eye-fixes/audit-transitions-normal.png)
- [angry에서 다른 표정](../dist/verify/before-eye-fixes/audit-transitions-angry.png)
- [curious에서 다른 표정](../dist/verify/before-eye-fixes/audit-transitions-curious.png)
- [cry에서 다른 표정](../dist/verify/before-eye-fixes/audit-transitions-cry.png)
- [shy에서 다른 표정](../dist/verify/before-eye-fixes/audit-transitions-shy.png)

## 22개 클립별 조사

“추가 결함 미발견”은 이번 눈동자/도형 연속성 조사에서 확인한 프레임 기준이다. 모든 가능한 타이밍·중단 조합의 무결성을 의미하지 않는다.

| 클립 | 조사 결과 |
| --- | --- |
| spinner | 고양이 눈 없음. 별과 링의 선택 프레임에서 추가 결함 미발견. |
| idle | normal 대체 눈 도형 사용. pupil 이동과 aperture blink는 같은 pupil 파트를 사용한다. |
| head-turn | normal 대체 눈 도형 사용. 독립 클립에서 별도 pupil 생성 없음. 머신 반응으로는 등록되어 있지 않음. |
| wink | normal 대체 눈 도형 사용. Rive에서 비기본 표정 위에 실행하면 오른쪽 pupil을 default로 덮어씀(P1). |
| nod | normal 대체 눈 도형 사용. Rive에서 양쪽 pupil을 default로 덮어씀(P1). |
| tilt | normal 대체 눈 도형 사용. Rive 표정 조합에서 pupil 덮어쓰기 미발견. |
| ear-twitch | normal 대체 눈 도형 사용. Rive 표정 조합에서 pupil 덮어쓰기 미발견. |
| ring-wobble | normal 대체 눈 도형 사용. Rive에서 양쪽 pupil을 default로 덮어씀(P1). |
| tail-flick | ring-wobble 호환 alias. 동일 결함(P1). |
| celebrate | happy white/mouth로 바꾸고 normal pupil을 유지/숨김. Rive는 의도적으로 얼굴 전체를 덮어쓰므로 다른 표정에서 시작해도 먼저 normal 눈으로 바뀐다. 복귀 표정은 확인 프레임에서 회복됨. 현재 표정에서 자연스럽게 웃도록 할지는 별도 연출 개선사항. |
| expr-angry | 원본 white 윤곽 사용, 별도 pupil null. 독립 루프 추가 중복 미발견. |
| expr-curious | 원본 white 윤곽 사용, 별도 pupil null. pupil 위치 트랙은 효과 없음(P3). |
| expr-cry | 원본 cry pupil 사용. 독립 루프 추가 중복 미발견. 반응 조합에서는 P1 영향. |
| expr-shy | 원본 닫힌 눈 유지, 별도 pupil null. 독립 루프 추가 중복 미발견. |
| to-angry | 닫힌 blink 중 윤곽 교체, normal 쪽은 대체 눈 도형 사용. |
| from-angry | 동일. 독립 클립과 직접 머신 전환은 다른 경로임. |
| to-curious | 닫힌 blink 중 윤곽 교체, normal 쪽은 대체 눈 도형 사용. |
| from-curious | 동일. |
| to-cry | 닫힌 blink 중 white/pupil 교체. 열린 상태에서 새 pupil을 겹쳐 유지하는 현상은 선택 프레임에서 미발견. |
| from-cry | 동일. |
| to-shy | 닫힌 blink 중 원본 닫힌 눈으로 교체. |
| from-shy | 닫힌 blink 중 normal 대체 눈으로 복귀. |

## 검증 범위와 한계

- 등록된 22개 클립의 코드와 7개 선택 시점 reference 렌더링을 조사했다. 고양이 클립 21개는 추가로 `node scripts/motion-contact-review.mjs`가 생성한 8개 시점 × reference/SVG/Lottie/Rive 4개 행을 모두 육안 확인했다.
- Rive의 5개 표정 × 7개 반응 입력, 총 35개 조합을 6개 시점에서 조사했다. 입력은 `react`, `reactNod`, `reactTilt`, `reactEarTwitch`, `reactTailFlick`, `reactRingWobble`, `reactCelebrate`이다.
- 서로 다른 표정 사이 전환 20개를 전환 전/50/100/200/500ms에서 조사했다.
- 원인 격리 실험은 4개 비기본 표정 × 6개 일반 반응 입력, 총 24개 대조 쌍이다.
- 조사용 스크립트와 이미지는 `dist/verify/audit*`, `probe.mjs`, `transitions.mjs`, `source.mjs`에 있다. `dist/verify/`는 커밋하지 않는다.
- SVG/Lottie/Rive 단독 클립 일치 검증인 `npm run verify`의 결과는 아래에 기록한다. 이 검증만으로 P1을 검출할 수 없다. 현재 머신 검증은 표정 전환 후 1초 프레임만 비교하며 반응 조합을 검사하지 않는다(`packages/verify/src/cli.ts:53`).
- 기존 `motion/reaction-layer.test.ts:19`의 nod 검사는 celebration 레이어 유무를 비교한다. 두 결과에 동일 pupil 덮어쓰기가 있어도 통과할 수 있다. 중단 검사는 trigger 직후 경계 프레임만 검사한다. 이번 조사는 모든 반복 입력/중단 타이밍을 추가 검증하지 않았다.
- `motion/source-expressions.test.ts`는 curious/angry/shy 원본을 검사하지만 normal 눈 원본 보존을 검사하지 않는다.

검증 실행 결과: `npm run verify` 종료 코드 0. `dist/verify/report.json`의 84개 비교 항목(등록 클립 22 × 3 target, fixture 4 × 3 target, Rive 표정 6)이 모두 PASS이며 skipped 없음. 영상 내보내기와 dotLottie 번들 로딩 검사도 완료됐다. 이는 exporter 간 일치 결과이며, 위 P1 재현 결과를 무효화하지 않는다.

수정 우선순위는 Rive의 반응/표정 채널 분리 → normal 원본 눈 보존 → 직접 표정 전환 개선 → 효과 없는 curious 트랙 정리다. 후속 사용자 요청으로 이 조사 범위의 exporter 수정도 승인되어 구현했다.
