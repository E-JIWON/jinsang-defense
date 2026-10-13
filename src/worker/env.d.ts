// 테스트용 가짜 AI 스위치. 배포 설정에는 두지 않고 `--var LLM_FAKE:1`로만 켠다.
interface Env {
  LLM_FAKE?: string;
}
