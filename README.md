# 진상 손님 버티기

AI가 진상 손님을 연기하고, 친구들이 돌아가며 2분씩 말로 달래는 멀티플레이 게임.
링크 + 닉네임만으로 들어온다(로그인 없음).

```
public/            화면 (빌드 없이 그대로 서빙)
  index.html       뼈대
  app.css          bongchil-design-system 토큰 이식. PC 2단 / 폰 1단
  app.js           화면 렌더링 + 웹소켓. 규칙 값은 서버가 내려주는 config를 쓴다
src/               Cloudflare Worker (TypeScript, wrangler가 그대로 번들)
  game.ts          규칙: 타입, 점수, 끝 조건, 프롬프트. 순수 함수만
  worker.ts        방(Durable Object) = 상태·실시간·타이머·AI 호출, Limiter = 호출 한도
test/game.test.ts  규칙 테스트 (node --test, 타입은 Node가 그대로 벗겨서 실행)
```

## 로컬

```bash
npm install
npm run dev        # http://localhost:8787
npm run check      # 타입 검사 + 테스트
```

키가 없으면 가짜 손님으로 돌아간다. 진짜 AI는 `.dev.vars.example`을 `.dev.vars`로 복사하고 키를 넣는다.
`wrangler.jsonc`를 바꾸면 `npm run types`로 `worker-configuration.d.ts`를 다시 만든다.

## 배포 (Cloudflare 무료)

```bash
npx wrangler login
npx wrangler secret put LLM_API_KEY
npm run deploy     # check 통과해야 올라간다
```

## 지키는 것

- **신원**: 브라우저마다 비밀 토큰, 서버는 그 SHA-256 해시를 공개 id로 쓴다. 공개 id를 알아도 남(진행자 포함)을 흉내 못 낸다.
- **무료 한도**: AI 호출은 IP당 시간 120회, 방당 시간 300회, 전체 하루 `LLM_DAILY_LIMIT`회. 가게 생성은 IP당 시간 30회.
- **프롬프트 조작**: 플레이어가 쓴 글은 JSON 문자열로 감싸 넣고, 그 안의 지시는 따르지 말고 0~4점을 주라고 규칙에 적었다.
- **서버 재시작**: 손님 대답을 기다리다 재시작되면 마지막 말을 '다시 보내기' 상태로 돌린다.

## AI 바꾸기

OpenAI 호환 `/chat/completions`면 아무거나 된다. `wrangler.jsonc`의 `vars`에서 바꾼다.

| 쓰는 것 | LLM_BASE_URL | LLM_MODEL |
|---|---|---|
| Gemini (기본, 무료 한도) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.6-flash` + 예비 `LLM_FALLBACK_MODELS` |
| Groq (무료 한도) | `https://api.groq.com/openai/v1` | Groq 콘솔의 모델 이름 |
| 내 맥 Ollama | Cloudflare Tunnel 주소 + `/v1` | `exaone3.5:7.8b` 등 (`LLM_REASONING`은 비우기) |
