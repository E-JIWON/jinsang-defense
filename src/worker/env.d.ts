// 테스트용 가짜 AI 스위치. 배포 설정에는 두지 않고 `--var LLM_FAKE:1`로만 켠다.
interface Env {
  LLM_FAKE?: string;
}

// 예비 AI(보통 내 PC의 Ollama + Cloudflare Tunnel). 주소가 바뀌어도 코드 배포 없이 바꾸도록 secret으로 넣는다.
// `npx wrangler secret put LLM_BACKUP_BASE_URL` (예: https://ollama.내도메인.com/v1)
interface Env {
  LLM_BACKUP_BASE_URL?: string;
  LLM_BACKUP_API_KEY?: string;
  // 터널을 Cloudflare Access로 막았을 때 쓰는 서비스 토큰
  LLM_BACKUP_ACCESS_ID?: string;
  LLM_BACKUP_ACCESS_SECRET?: string;
}
