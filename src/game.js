// 진상 손님 버티기: 게임 규칙 (순수 함수만. 저장·소켓·AI 호출은 worker.js 몫)

export const TURN_MS = 120000;
export const MAX_LINES = 10;
export const REACTS = ["🔥", "😂", "💀", "👏"];
const PLACES = ["편의점", "카페", "휴대폰 매장", "헬스장", "미용실", "은행 창구", "택배 대리점", "PC방", "고깃집", "호텔 프런트", "중고거래 직거래 현장", "회사 탕비실"];
export const OUTCOME = { happy: "만족 퇴장", boom: "손님 폭발", time: "시간 종료", lines: "대화 한도", skip: "자리 비움" };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const str = (v, max = 400) => String(v ?? "").slice(0, max);

export function fresh() {
  return { hostId: null, players: {}, phase: "lobby", round: 0, order: [], turnIdx: 0, customer: null, turn: null, roundResults: [], review: null, scores: {}, rounds: [], lastError: null };
}

export const staffOf = (c) => c?.staff || `${c?.place || "가게"} 직원`;
export const goalOf = (c) => c?.goal || "손님 분노를 낮춰서 웃으며 돌려보내기";

export function remaining(t, now = Date.now()) {
  if (!t?.clock) return TURN_MS;
  return TURN_MS - t.clock.spent - (t.clock.resumeAt ? now - t.clock.resumeAt : 0);
}

/* ---------- 프롬프트 ---------- */
export function customerPrompt(idea) {
  return `즉흥 상황극 게임용 웃긴 진상 손님 캐릭터를 하나 만들어라.
${idea ? "상황/장소 힌트: " + idea : "장소: " + PLACES[Math.floor(Math.random() * PLACES.length)]}
- 진짜 진상이어야 한다: 규정·상식에 어긋나는 무리한 요구를 당연한 권리처럼 우기고, 말꼬리를 잡고, "사장 나와", "내가 여기 단골인데" 같은 갑질을 한다. 혐오·폭력·성적인 내용은 빼라.
- 직원은 그 요구를 그대로 들어주면 안 되는 처지여야 한다(규정, 비용, 다른 손님 등). 그래서 말로 달래야 한다.
- goal은 "무리한 요구는 들어주지 않으면서 손님을 진정시켜 돌려보내기"처럼, 굽신거림만으로는 이룰 수 없게 쓴다.
JSON만 답한다:
{"name":"손님 별명(예: 영수증 없는 교환왕)","place":"장소","staff":"플레이어가 맡을 직원 역할(예: 휴대폰 매장 상담 직원)","goal":"직원의 목표 한 줄(예: 규정은 지키면서 손님을 웃으며 돌려보내기)","want":"손님이 끝까지 원하는 것 한 가지(예: 영수증 없이 새 폰으로 무상 교환)","tags":["특징 3개, 각 10자 이내"],"situation":"상황 설명 1~2문장","opening":"손님 첫 대사 1~2문장","anger":40~65 사이 시작 분노 정수}`;
}

export function replyPrompt(c, t) {
  return `즉흥 상황극. 너는 진상 손님 '${c.name}'이다. 상대는 이 가게 직원(플레이어)이다.
장소: ${c.place} / 손님 특징: ${(c.tags || []).join(", ")} / 직원 역할: ${staffOf(c)}
상황: ${c.situation}
${c.want ? `손님(너)이 끝까지 원하는 것: ${c.want}
` : ""}역할 규칙 (가장 중요):
- 너는 끝까지 손님이다. 절대 직원처럼 말하거나 행동하지 않는다. 음료·물건을 만들어 주거나, 서비스해 주거나, "만들어드릴게요", "도와드릴게요", "기대하세요" 같은 직원의 말은 금지.
- 요구하고, 불평하고, 트집 잡고, 마음에 들면 누그러지는 쪽이 너다. 서비스를 받는 쪽이 너다.
- act는 손님인 너의 행동, thought는 손님인 너의 속마음이다(직원 입장 금지).
- 직원이 이상한 말을 해도 역할을 바꾸지 말고 손님으로서 반응한다.
대화 흐름 규칙:
- 직원의 마지막 말에 직접 반응한다. 직원이 한 질문·제안·농담·비꼼을 정확히 알아듣고 그에 맞게 받아친다(비꼼은 비꼼으로 알아챈다).
- 요구는 처음 상황과 원하는 것에서 벗어나지 않는다. 대답할 때마다 새로운 엉뚱한 설정이나 물건을 지어내지 않는다. 황당해도 앞 대화와 자연스럽게 이어져야 한다.
- 너는 진상이다. 쉽게 만족하지 않는다. 직원이 요구를 그대로 다 들어주겠다고 하면 고마워하지 말고 더 무리한 요구를 얹는다.
- 직원이 그럴듯한 타협안을 내면 조건을 하나 더 거는 식으로 밀고 당긴다.
채점 규칙:
- 직원 말의 맞춤법, 오타, 띄어쓰기, 말투 실수는 절대 언급하거나 트집 잡지 않는다. 내용에만 반응한다.
- grade: 방금 직원 말의 응대 점수 0~20. 기준은 "직원의 목표를 지키면서 손님을 다루는 솜씨"다.
  · 15~20: 무리한 요구는 들어주지 않으면서 재치·공감·대안으로 손님을 누그러뜨림
  · 10~14: 선은 지키지만 평범하게 응대함
  · 5~9: 무리한 요구를 그냥 다 들어주겠다고 굽신거림, 또는 원칙만 반복
  · 0~4: 무시, 비꼼, 성의 없음, 싸움
- why: 그 점수의 이유를 8자 이내로(예: "공감 굿", "센스 만점", "영혼 없음").
- 분노 게이지(0~100)를 갱신한다. 지금 분노는 ${t.anger}. grade 15 이상이면 -5~-15, 10~14면 -5~+5, 9 이하면 +5~+20. 진상이라 한 번에 크게 풀리지 않는다.
- 굽신거림에는 분노가 잠깐 내려가도 요구가 더 커진다. 좋은 응대에는 속마음이 먼저 흔들린다("말은 잘하네…").
- 분노가 0 근처면 만족해서 떠날 준비를 하고, 100이면 폭발한다.
대화 (손님=너, 직원=플레이어):
${t.msgs.map((m) => (m.f === "c" ? "손님(너): " : "직원: ") + m.t).join("\n")}
이제 손님(너)의 다음 반응을 쓴다.
JSON만 답한다:
{"grade":응대 점수 정수,"why":"이유 8자 이내","reply":"손님(너)이 직원에게 하는 말 1~2문장","act":"짧은 행동 지문(예: 카운터를 손가락으로 톡톡)","thought":"손님(너)의 속마음 한 줄","anger":새 분노 정수}`;
}

export function reviewPrompt(c, rs) {
  return `너는 방금 가게를 다녀간 진상 손님 '${c.name}'이다(${c.place}). 직원들의 응대를 보고 리뷰 앱에 별점과 리뷰를 남긴다. 캐릭터 말투 그대로, 짧고 웃기게. 직원의 맞춤법이나 오타는 언급하지 않는다. 별점은 응대 점수가 높았던 직원일수록 후하게 준다.
${rs.map((r, i) => `[p${i + 1}] 결과: ${OUTCOME[r.endedBy]}, 최종 분노 ${r.anger}, 응대 점수 ${r.score}\n${(r.msgs || []).map((m) => (m.f === "c" ? "손님: " : "직원: ") + m.t).join("\n") || "(응대 안 함)"}`).join("\n\n")}
JSON만 답한다: {"headline":"오늘 가게에 대한 총평 한 줄","items":[{"p":"p1","stars":1~5,"review":"리뷰 한두 문장"}]}`;
}

/* ---------- AI 응답 해석 ---------- */
export function parseJson(text) {
  const s = String(text || "").replace(/```(?:json)?/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI 응답이 JSON이 아니에요");
  return JSON.parse(s.slice(a, b + 1));
}

export function toCustomer(out) {
  return { name: str(out.name, 40) || "이름 모를 손님", place: str(out.place, 40), staff: str(out.staff, 40), goal: str(out.goal, 80), want: str(out.want, 80),
    tags: (Array.isArray(out.tags) ? out.tags : []).slice(0, 4).map((x) => str(x, 20)), situation: str(out.situation, 300),
    opening: str(out.opening, 300) || "저기요!", anger: clamp(Math.round(Number(out.anger)) || 50, 20, 80) };
}

// 손님 대답을 차례에 반영. 끝날 조건이면 이유를 돌려준다
export function applyReply(t, out, now = Date.now()) {
  const grade = clamp(Math.round(Number(out.grade)) || 0, 0, 20);
  const pm = t.msgs.at(-1); pm.g = grade; pm.why = str(out.why, 12); delete pm.failed;
  t.points = (t.points || 0) + grade;
  t.anger = clamp(Number.isFinite(Number(out.anger)) ? Math.round(Number(out.anger)) : t.anger, 0, 100);
  t.msgs.push({ f: "c", t: str(out.reply) || "…", act: str(out.act, 120), thought: str(out.thought, 120) });
  t.thinking = false; t.lastError = null; t.clock.resumeAt = now;
  const lines = t.msgs.filter((m) => m.f === "p").length;
  return t.anger >= 100 ? "boom" : t.anger <= 5 ? "happy" : lines >= MAX_LINES ? "lines" : remaining(t, now) <= 0 ? "time" : null;
}

// 점수 = 한마디마다 받은 응대 점수 합 + 만족 퇴장 30 + 리액션(최대 20). 폭발하면 보너스 없음
export function endTurn(g, reason, now = Date.now()) {
  const t = g.turn;
  if (t.clock.resumeAt) t.clock = { spent: t.clock.spent + (now - t.clock.resumeAt), resumeAt: null };
  t.status = "done"; t.endedBy = reason; t.thinking = false;
  t.bonus = (reason === "happy" ? 30 : 0) + (reason === "boom" ? 0 : Math.min(20, (t.reacts || 0) * 2));
  t.score = (t.points || 0) + t.bonus;
  g.scores[t.player] = (g.scores[t.player] || 0) + t.score;
  g.roundResults.push({ player: t.player, anger: t.anger, endedBy: reason, score: t.score, msgs: t.msgs });
  g.turnIdx += 1;
  archive(g);
}

export function skipTurn(g) {
  g.roundResults.push({ player: g.order[g.turnIdx], anger: g.customer.anger, endedBy: "skip", score: 0, msgs: [] });
  g.turnIdx += 1;
  archive(g);
}

// 지난 손님 기록: 응대 하나 끝날 때마다, 리뷰 나올 때 한 번 더 갱신
export function archive(g) {
  const entry = { round: g.round, customer: g.customer, results: g.roundResults, review: g.review, at: Date.now() };
  const i = g.rounds.findIndex((r) => r.round === g.round);
  if (i >= 0) g.rounds[i] = entry; else g.rounds.push(entry);
  if (g.rounds.length > 50) g.rounds.splice(0, g.rounds.length - 50); // ponytail: 오래된 손님은 50명까지만. 더 필요하면 별도 저장
}

export function toReview(out, rs) {
  const items = rs.map((r, i) => {
    const it = (out.items || []).find((x) => x.p === "p" + (i + 1)) || {};
    return { player: r.player, stars: clamp(Math.round(Number(it.stars)) || 1, 1, 5), review: str(it.review, 300) || "…" };
  });
  return { headline: str(out.headline, 120), items };
}

/* ---------- 키 없이 돌려보는 가짜 손님 (로컬 테스트용) ---------- */
export function fakeAnswer(kind, t) {
  if (kind === "customer") return { name: "영수증 없는 교환왕", place: "휴대폰 매장", staff: "휴대폰 매장 상담 직원", goal: "규정은 지키면서 웃으며 돌려보내기", tags: ["영수증 없음", "목소리 큼", "3년 전 구매"], situation: "3년 전에 산 폰을 새 모델로 무상 교환해 달라고 한다. 영수증은 '마음속에' 있다고 한다.", opening: "저기요, 이거 교환 좀 해줘요. 영수증? 마음속에 있죠.", anger: 55 };
  if (kind === "reply") { const g = 4 + Math.floor(Math.random() * 15); return { grade: g, why: g >= 12 ? "센스 굿" : "영혼 없음", reply: g >= 12 ? "흠… 그렇게 나오시니까 좀 낫네요." : "지금 장난해요? 사장 불러요!", act: "카운터를 손가락으로 톡톡", thought: g >= 12 ? "말빨 좀 되네" : "이 직원 대충 넘기려 하네", anger: Math.max(0, Math.min(100, t.anger + (g >= 12 ? -15 : 12))) }; }
  return { headline: "가짜 손님이 남긴 가짜 리뷰", items: [{ p: "p1", stars: 3, review: "키를 넣으면 진짜 리뷰를 써 드림." }] };
}
