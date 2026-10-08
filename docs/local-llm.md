# 내 PC를 예비 AI로 (Ollama + Qwen3.5-9B)

Gemini가 한도(429)나 장애로 실패하면 내 PC의 Ollama가 대신 손님을 연기해요. PC가 꺼져 있으면 예전처럼 "다시 보내기" 안내가 나와요.

```
Gemini (주력) ──실패──▶ 내 PC Ollama qwen3.5:9b (예비) ──실패──▶ 다시 보내기 안내
```

- 기준 사양: RTX 4060 Ti 8GB, RAM 32GB, Windows 11. `qwen3.5:9b`(4비트, 약 6.6GB)는 VRAM에 통째로 들어가요.
- 예비 호출은 생각(추론)을 끄고, 예시를 보여 주고, JSON 모양을 스키마로 묶어요(`src/worker/prompts.ts`의 `BACKUP_HINTS`·`SCHEMAS`).
- 주력이 429로 막히면 30초(하루 한도면 10분) 동안 주력을 건너뛰고 바로 예비로 가요.

## 1. Ollama 설치와 모델 받기

1. [ollama.com/download](https://ollama.com/download)에서 Windows 버전을 설치해요.
2. 시스템 환경 변수(설정 → 시스템 → 정보 → 고급 시스템 설정 → 환경 변수)에 넣고 Ollama를 다시 켜요.

   | 이름 | 값 | 이유 |
   |---|---|---|
   | `OLLAMA_KEEP_ALIVE` | `-1` | 모델을 계속 올려 둬서 첫 응답이 느려지지 않게 |
   | `OLLAMA_CONTEXT_LENGTH` | `8192` | 리뷰 프롬프트(직원 여럿의 대화)가 잘리지 않게 |

3. PowerShell에서:

   ```powershell
   ollama pull qwen3.5:9b
   ollama run qwen3.5:9b "편의점 진상 손님처럼 한마디 해 줘"
   ```

## 2. 품질·속도 비교 (내 PC에서)

`.dev.vars`에 `LLM_API_KEY`(Gemini 키)가 있으면 Gemini와 같이 비교하고, 없으면 로컬만 봐요.

```powershell
npm install
npm run compare
```

손님 만들기 → 응대 3종(좋은 응대 / 굽신 / 점수 조작 꼼수) → 리뷰를 차례로 보내고 걸린 시간, JSON 성공 여부, 점수가 기대 범위인지(✅/❌) 표로 보여 줘요.
`REPEAT=3`(PowerShell은 `$env:REPEAT=3; npm run compare`)이면 응대를 세 번씩 돌려요.

목표: 응대 한 번에 5초 안팎, 굽신·꼼수에 ✅.

- 오류가 나거나 아주 느리면 Ollama가 `reasoning_effort: "none"`을 못 알아듣는 경우예요. `.dev.vars`에 `LLM_BACKUP_REASONING=`(빈 값)을 넣고 다시 비교해 보세요.
- 다른 모델을 보려면 `LLM_BACKUP_MODEL=qwen3.5:4b`처럼 바꿔요.

## 3. 게임에 연결 (Cloudflare Tunnel)

배포된 게임(Cloudflare)이 내 PC에 닿으려면 터널이 필요해요.

1. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)를 설치해요 (`winget install --id Cloudflare.cloudflared`).
2. 터널을 열어요. Ollama는 바깥 주소로 온 요청을 막으니 `--http-host-header`가 꼭 필요해요.

   ```powershell
   cloudflared tunnel --url http://localhost:11434 --http-host-header localhost:11434
   ```

   `https://무작위-이름.trycloudflare.com` 주소가 나와요.

3. 그 주소에 `/v1`을 붙여 secret으로 넣어요. 코드 배포 없이 바로 적용돼요.

   ```powershell
   npx wrangler secret put LLM_BACKUP_BASE_URL
   # 입력: https://무작위-이름.trycloudflare.com/v1
   ```

모델 이름(`LLM_BACKUP_MODEL`)과 생각 끄기(`LLM_BACKUP_REASONING`)는 `wrangler.jsonc`의 `vars`에 있어요.
예비를 끄려면 `npx wrangler secret delete LLM_BACKUP_BASE_URL`.

### 주의: 빠른 터널은 주소가 바뀌고, 주소를 아는 누구나 쓸 수 있어요

- `trycloudflare.com` 주소는 cloudflared를 다시 켤 때마다 바뀌어요. 바뀌면 3번을 다시 해요.
- Ollama에는 비밀번호가 없어서 주소가 새면 남이 내 GPU를 쓸 수 있어요. 주소는 secret에만 두고 공유하지 마세요.
- Cloudflare에 내 도메인이 있으면 **이름 있는 터널 + Cloudflare Access 서비스 토큰**이 안전하고 주소도 고정돼요.
  1. Zero Trust → Networks → Tunnels에서 터널을 만들고 `ollama.내도메인.com` → `http://localhost:11434`(HTTP Host Header: `localhost:11434`)로 연결
  2. Zero Trust → Access → Service Auth에서 서비스 토큰을 만들고, 그 호스트에 Service Auth 정책을 걸어요
  3. secret 세 개를 넣어요:

     ```powershell
     npx wrangler secret put LLM_BACKUP_BASE_URL      # https://ollama.내도메인.com/v1
     npx wrangler secret put LLM_BACKUP_ACCESS_ID     # 서비스 토큰 Client ID
     npx wrangler secret put LLM_BACKUP_ACCESS_SECRET # 서비스 토큰 Client Secret
     ```

## 로컬 개발에서 써 보기

`.dev.vars`에 추가하면 `npm run dev`에서도 Gemini → 내 PC 순서로 돌아요.

```
LLM_BACKUP_BASE_URL=http://localhost:11434/v1
```

## 한계

- 한 방에서는 AI 호출이 한 번에 하나라 2~5명은 충분해요. 방이 여러 개 동시에 돌면 GPU 하나가 차례로 처리해서 기다림이 생겨요.
- 리뷰는 출력이 길어서 응대보다 오래 걸려요.
- 9B는 Gemini보다 연기·채점이 흔들릴 수 있어요. `npm run compare`로 확인하고, 부족하면 예시(`BACKUP_HINTS`)를 늘리거나 실제 플레이 기록으로 학습(파인튜닝)하는 걸 다음 단계로 생각해요.
