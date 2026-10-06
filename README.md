# 진상 손님 버티기

AI가 진상 손님을 연기하고, 친구들이 돌아가며 2분씩 말로 달래는 멀티플레이 게임.
링크 + 닉네임만으로 들어온다(로그인 없음).

- `public/index.html`: 화면 전부
- `src/worker.js`: 방 코드마다 Durable Object 하나가 상태·실시간 연결·타이머·AI 호출을 맡는다
- `src/game.js`: 규칙(점수, 끝 조건, 프롬프트)

## 로컬에서 돌리기

```bash
npm install
npm run dev        # http://localhost:8787
npm test           # 규칙 테스트
```

키가 없으면 가짜 손님으로 돌아간다. 진짜 AI는 `.dev.vars.example`을 `.dev.vars`로 복사하고 키를 넣는다.

## 배포 (Cloudflare 무료)

```bash
npx wrangler login
npx wrangler secret put LLM_API_KEY
npm run deploy
```

## AI 바꾸기

OpenAI 호환 `/chat/completions`면 아무거나 된다. `wrangler.jsonc`의 `vars`에서 바꾼다.

| 쓰는 것 | LLM_BASE_URL | LLM_MODEL |
|---|---|---|
| Gemini (기본, 무료 한도) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash` (`LLM_REASONING: none`으로 생각 끄면 3초) |
| Groq (무료 한도) | `https://api.groq.com/openai/v1` | Groq 콘솔의 모델 이름 |
| 내 맥 Ollama | Cloudflare Tunnel 주소 + `/v1` | `exaone3.5:7.8b` 등 |
