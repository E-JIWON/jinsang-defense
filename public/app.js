// 게임 규칙 값은 서버(src/game.ts CONFIG)가 상태와 함께 내려준다. 아래는 첫 상태가 오기 전 기본값
let C = { TURN_MS: 120000, MAX_LINES: 10, REACTS: [], OUTCOME: {} };
const COLORS = ["#4a7c59", "#50aac8", "#c8a050", "#c86e82", "#b47850", "#64be8c", "#5a544e"]; // bongchil 디자인 시스템 comment-*-solid
const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el[k] = v;
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
const pascal = (n) => n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
function icon(name, fallback = "") {
  const node = window.lucide?.icons?.[pascal(name)];
  return node ? window.lucide.createElement(node) : document.createTextNode(fallback);
}
const mood = (a) => a <= 50
  ? `color-mix(in oklab, #5a8268 ${100 - a * 2}%, #c8a050)`
  : `color-mix(in oklab, #c8a050 ${200 - a * 2}%, #c2607a)`;
const faceOf = (a) => (a < 20 ? "laugh" : a < 40 ? "smile" : a < 60 ? "meh" : a < 80 ? "frown" : "angry");
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const staffOf = (c) => c?.staff || `${c?.place || "가게"} 직원`;
const goalOf = (c) => c?.goal || "손님 분노를 낮춰서 웃으며 돌려보내기";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ---------- 나 · 방 · 연결 ---------- */
// 비밀 토큰은 이 브라우저에만 있고, 서버는 그 해시를 공개 id로 쓴다(남이 흉내 못 냄). me는 서버가 'you'로 알려준다
const token = store.get("jinsang-token") || [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
store.set("jinsang-token", token);
let me = null;
let nick = store.get("jinsang-nick") || "";
let code = (location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/) || [])[1]?.toUpperCase() || null;
const roomUrl = () => `${location.origin}/r/${code}`;

let rounds = [];
let ws = null, g = null, online = [], errMsg = "", connected = false, retry = 0;
let tab = "now", pastOpen = null, custOpen = false, customIdea = "", confirmFold = false, lastAnimated = "";
const expanded = new Set();

function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}`);
  ws.onopen = () => {
    connected = true; retry = 0;
    if (nick && !needNick) ws.send(JSON.stringify({ type: "hello", token, nick }));
    while (outbox.length) ws.send(outbox.shift()); // 끊긴 동안 누른 동작은 다시 연결되면 보낸다
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === "you") { me = m.id; render(); return; }
    if (m.type === "rounds") { rounds = m.rounds || []; render(); return; }
    if (m.type === "state") {
      const prev = g, prevOnline = online; g = m.g; online = m.online; errMsg = ""; if (m.config) C = m.config;
      const t = g.turn, pt = prev?.turn;
      if (t && pt && t.player === pt.player && t.anger > pt.anger + 9) setTimeout(shakeFace, 50);
      if (t?.status === "done" && pt?.status === "live" && t.player === pt.player) toast(`${nameOf(t.player)} 응대 끝 · +${t.score}`);
      if (t?.status === "live" && pt?.status !== "live" && t.player !== me) toast(`${nameOf(t.player)}님 응대 시작`);
      if (prev) for (const id of online) if (!prevOnline.includes(id) && id !== me) toast(`${nameOf(id)}님이 들어왔어요`);
      render();
    } else if (m.type === "react") floaty(m.e);
    else if (m.type === "error") { errMsg = m.msg; render(); }
  };
  ws.onclose = () => { connected = false; render(); setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); };
}
const outbox = [];
function act(type, extra = {}) {
  const msg = JSON.stringify({ type, ...extra });
  if (ws?.readyState === 1) return ws.send(msg);
  outbox.push(msg); if (outbox.length > 5) outbox.shift();
  toast("다시 연결하는 중이에요. 연결되면 바로 보낼게요");
}

/* ---------- 파생 ---------- */
const isHost = () => g?.hostId === me;
const current = () => g?.order?.[g.turnIdx];
const isResponder = () => g?.turn?.player === me && g.turn.status === "live";
const nameOf = (id) => (id === me ? "나" : g?.players?.[id]?.nick || "누군가");
function avatar(id, cls = "av") {
  const n = g?.players?.[id]?.nick || "?";
  let x = 0; for (const c of id || "") x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return h("span", { className: cls, style: `--c:${COLORS[x % COLORS.length]}`, textContent: [...n][0] || "?", ariaHidden: "true" });
}
const face = (anger, cls = "face", id = null) => h("div", { className: cls, id, style: `--mood:${mood(anger)}` }, icon(faceOf(anger), "·"));
function remaining(t = g?.turn) {
  if (!t?.clock) return C.TURN_MS;
  return C.TURN_MS - t.clock.spent - (t.clock.resumeAt ? Date.now() - t.clock.resumeAt : 0);
}
const pastRounds = () => rounds.filter((r) => !(r.round === g.round && ["playing", "review", "reviewing"].includes(g.phase))).sort((a, b) => (b.at || 0) - (a.at || 0));
const staffIds = () => Object.entries(g?.players || {}).filter(([, p]) => p.staff).sort((a, b) => a[1].joinedAt - b[1].joinedAt).map(([id]) => id);

/* ---------- 연출 ---------- */
function toast(text) { const t = h("div", { className: "toast", textContent: text }); $("toasts").append(t); setTimeout(() => t.remove(), 2600); }
function floaty(e) {
  const th = $("thread"); if (!th) return;
  const f = h("span", { className: "floaty", textContent: e, style: `left:${10 + Math.random() * 80}%` });
  th.append(f); setTimeout(() => f.remove(), 1900);
}
function shakeFace() { const f = $("face"); if (!f) return; f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake"); }
const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
function stickBottom(force) { if (!force && !nearBottom()) return; requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced ? "auto" : "smooth" })); }
setInterval(() => {
  const el = $("clock"), t = g?.turn;
  if (!el || t?.status !== "live") return;
  const r = remaining(t);
  el.textContent = fmt(r);
  el.className = "clock" + (t.thinking ? " paused" : r < 15000 ? " low" : "");
}, 250);
function copyLink(inp) {
  navigator.clipboard?.writeText(roomUrl()).then(() => toast("초대 링크를 복사했어요"), () => inp?.select()) ?? inp?.select();
}

/* ---------- 조각 ---------- */
const errEl = () => (errMsg || g?.lastError ? h("p", { className: "err", textContent: errMsg || g.lastError }) : null);
function hostAway() {
  const away = g && !online.includes(g.hostId) && !isHost() && g.players?.[me]?.staff;
  return away ? h("div", { className: "row" }, h("span", { className: "sub", textContent: `진행자 ${nameOf(g.hostId)}님이 자리를 비웠어요.` }), h("button", { className: "btn", textContent: "내가 진행할게요", onclick: () => act("takeHost") })) : null;
}
function customerDetails(c) {
  return [
    h("div", { className: "tags" }, c.place ? h("span", { className: "tag", textContent: c.place }) : null, (c.tags || []).map((t) => h("span", { className: "tag", textContent: t }))),
    h("p", { textContent: c.situation }),
    c.want ? h("p", { className: "sub", textContent: "원하는 것 · " + c.want }) : null,
  ].filter(Boolean);
}
const roleLine = (c, style = "") => h("div", { className: "role", style }, h("span", { className: "label", textContent: "내 역할" }), h("span", {}, h("b", { textContent: staffOf(c) }), " · " + goalOf(c)));

// 손님 바: 얼굴·이름·시계·분노 막대. 폰에선 눌러서 상황을 펼친다(PC는 옆 패널에 항상)
function custBar(c, anger, sub, clock) {
  return h("div", { className: "custbar" + (custOpen ? " open" : "") },
    h("button", { className: "cb-row", ariaExpanded: String(custOpen), onclick: () => { custOpen = !custOpen; render(); } },
      face(anger, "face", clock ? "face" : null),
      h("div", { className: "cb-main" },
        h("div", { className: "row", style: "gap:8px;flex-wrap:nowrap" }, h("span", { className: "label cust", textContent: "손님" }), h("span", { className: "cb-name", textContent: c.name })),
        h("div", { className: "meter", style: `--mood:${mood(anger)}`, title: `분노 ${anger}` }, h("i", { style: `width:${anger}%` })),
        h("span", { className: "cb-sub", textContent: `분노 ${anger} · ${sub}` })),
      clock, h("span", { className: "chev desk-hide" }, icon("chevron-down", "▾"))),
    custOpen ? h("div", { className: "cb-more desk-hide" }, customerDetails(c), roleLine(c)) : h("div", { className: "role-mini desk-hide" }, h("span", { className: "label", textContent: "내 역할" }), h("span", { textContent: staffOf(c) })));
}
function bubbles(msgs, animKey, player) {
  return msgs.map((m, i) => {
    if (m.f === "p") return h("div", { className: "mp" },
      i === 1 && player ? h("span", { className: "who", textContent: nameOf(player) }) : null,
      h("div", { className: "bubble", textContent: m.t, style: m.failed ? "opacity:.55" : "" }),
      m.failed ? h("div", { className: "meta" }, h("span", { className: "chip bad", textContent: "전송 실패" }), animKey && g.turn?.player === me ? h("button", { className: "btn solid retry", textContent: "다시 보내기", onclick: () => act("retry") }) : null)
        : m.g != null ? h("div", { className: "meta" }, h("span", { className: "chip" + (m.g >= 12 ? " good" : m.g <= 6 ? " bad" : ""), textContent: `+${m.g}${m.why ? " · " + m.why : ""}` })) : null);
    const bubble = h("div", { className: "bubble" });
    const meta = (m.act || m.thought) ? h("div", { className: "meta" },
      m.act ? h("span", { className: "act", textContent: m.act }) : null,
      m.thought ? h("span", { className: "thought", textContent: "속마음 · " + m.thought }) : null) : null;
    const key = `${animKey}:${i}`;
    if (animKey && i === msgs.length - 1 && i > 0 && lastAnimated !== key && !reduced) {
      lastAnimated = key; if (meta) meta.hidden = true;
      let n = 0; const tm = setInterval(() => { if (!bubble.isConnected) return clearInterval(tm); n++; bubble.textContent = m.t.slice(0, n); if (n % 12 === 0) stickBottom(); if (n >= m.t.length) { clearInterval(tm); if (meta) meta.hidden = false; stickBottom(); } }, 28);
    } else bubble.textContent = m.t;
    return h("div", { className: "mc" }, face(g?.customer?.anger ?? 50, "face sm"), h("div", { className: "body" }, bubble, meta));
  });
}
function doneTurn(r, key, openByDefault) {
  const open = expanded.has(key) || (openByDefault && !expanded.has("x" + key));
  const toggle = () => { if (open) { expanded.delete(key); expanded.add("x" + key); } else { expanded.add(key); expanded.delete("x" + key); } render(); };
  return [
    h("div", { className: "pill" }, avatar(r.player, "av sm"), h("b", { textContent: nameOf(r.player) }), `응대 · ${C.OUTCOME[r.endedBy] || ""} ·`, h("span", { className: "plus", textContent: `+${r.score ?? 0}` })),
    r.msgs?.length ? (open ? [...bubbles(r.msgs, null, null), h("button", { className: "fold", textContent: "접기", onclick: toggle })] : h("button", { className: "fold", textContent: `대화 ${r.msgs.length}개 보기`, onclick: toggle })) : null,
  ].flat().filter(Boolean);
}
function reviewBox(rv, results) {
  if (!rv) return null;
  const byP = Object.fromEntries((results || []).map((r) => [r.player, r]));
  const items = [...(rv.items || [])].sort((a, b) => (byP[b.player]?.score || 0) - (byP[a.player]?.score || 0));
  return h("div", { className: "review" },
    h("div", { className: "eyebrow", textContent: "손님 리뷰" }),
    rv.headline ? h("div", { className: "hd", textContent: `“${rv.headline}”` }) : null,
    items.map((it) => h("div", { className: "rv" },
      avatar(it.player, "av sm"),
      h("div", { className: "row", style: "gap:8px;flex-wrap:nowrap;min-width:0" }, h("b", { textContent: nameOf(it.player) }), h("span", { className: "stars", textContent: "★".repeat(it.stars) + "☆".repeat(5 - it.stars) })),
      h("span", { className: "sc", textContent: "+" + (byP[it.player]?.score ?? 0) }),
      h("p", { textContent: it.review }))));
}
function inviteBox() {
  const inp = h("input", { id: "invite-link", readOnly: true, value: roomUrl(), onfocus: (e) => e.target.select(), ariaLabel: "초대 링크" });
  return h("div", { className: "invitebox" },
    h("div", { className: "row", style: "justify-content:space-between" }, h("span", { className: "h3", textContent: "친구 초대" }), h("span", { className: "code", textContent: code })),
    h("div", { className: "linkbox" }, inp, h("button", { className: "btn", textContent: "링크 복사", onclick: () => copyLink(inp) })),
    h("p", { className: "tiny", textContent: "링크를 받은 친구는 닉네임만 쓰면 바로 직원으로 들어와요." }));
}
function rosterCard(title, withScores) {
  const ids = withScores ? (g.order?.length ? g.order : staffIds()) : [...new Set([...staffIds(), ...online])];
  const done = new Set((g.roundResults || []).map((r) => r.player));
  return h("div", { className: "card tight" },
    h("div", { className: "row", style: "justify-content:space-between" }, h("span", { className: "h3", textContent: title }), h("span", { className: "tiny", textContent: `${online.length}명 접속` })),
    h("div", { className: "list" }, ids.map((id) => {
      const p = g.players[id] || {}, isCur = withScores && current() === id && g.phase === "playing";
      return h("div", { className: "li" + (isCur ? " now" : "") }, avatar(id),
        h("div", { className: "txt" }, h("b", { textContent: nameOf(id) }), h("span", { textContent: id === g.hostId ? "진행자" : p.staff ? "직원" : "구경 중" })),
        withScores ? h("span", { className: "badge" + (done.has(id) ? " ok" : isCur ? " host" : ""), textContent: done.has(id) ? "응대 끝" : isCur ? "응대 차례" : "대기" }) : h("span", { className: "badge" + (p.staff ? " ok" : ""), textContent: p.staff ? "참가" : "구경" }),
        withScores ? h("span", { className: "sc", style: "font-size:13px;min-width:28px;text-align:right", textContent: g.scores?.[id] || 0 }) : null,
        h("span", { className: "dot" + (online.includes(id) ? " on" : "") }));
    })));
}

/* ---------- 홈 · 닉네임 ---------- */
// 메인과 초대 입장은 같은 틀: 왼쪽 = 소개 + 닉네임 + 버튼, 오른쪽 = 미리보기
function previewChat() {
  return h("div", { className: "preview", ariaHidden: "true" },
    h("div", { className: "row", style: "gap:10px;flex-wrap:nowrap" }, face(62), h("div", { style: "min-width:0" }, h("b", { textContent: "영수증 없는 교환왕", style: "display:block;font-size:14px" }), h("span", { className: "tiny", textContent: "휴대폰 매장 · 분노 62" }))),
    h("div", { className: "mc" }, face(62, "face sm"), h("div", { className: "body" }, h("div", { className: "bubble", textContent: "교환해 줘요. 영수증은 마음속에 있어요." }))),
    h("div", { className: "mp" }, h("div", { className: "bubble", textContent: "마음속 영수증은 저희 시스템에서 조회가 안 돼요 ㅠㅠ" }), h("div", { className: "meta" }, h("span", { className: "chip good", textContent: "+14 · 센스 만점" }))),
    h("div", { className: "mc" }, face(48, "face sm"), h("div", { className: "body" }, h("div", { className: "bubble", textContent: "요즘 시대에 마음도 조회가 안 돼요?" }), h("div", { className: "meta" }, h("span", { className: "thought", textContent: "속마음 · 말빨 좀 되네" })))));
}
function nickInput() {
  return h("input", { id: "nick-in", maxLength: 12, placeholder: "내 닉네임", value: nick, ariaLabel: "닉네임", autocomplete: "off" });
}
// 닉네임을 저장하고 방으로 (페이지 새로고침 없이)
function enter(roomCode, nickValue) {
  const v = (nickValue || "").trim();
  if (!v) { errMsg = "닉네임을 먼저 적어 주세요."; render(); $("nick-in")?.focus(); return false; }
  nick = v; store.set("jinsang-nick", v); errMsg = "";
  needNick = false;
  if (code !== roomCode) { code = roomCode; g = null; online = []; history.pushState(null, "", "/r/" + roomCode); }
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "hello", token, nick })); else if (!ws) connect();
  render(); window.scrollTo(0, 0);
  return true;
}
function homeView() {
  const nickIn = nickInput();
  const codeIn = h("input", { id: "code-in", maxLength: 8, placeholder: "K7QPX", autocapitalize: "characters", ariaLabel: "가게 코드" });
  const open = async () => {
    if (!nickIn.value.trim()) return enter(null, "");
    const r = await fetch("/api/room", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (r?.code) enter(r.code, nickIn.value); else { errMsg = "가게를 열지 못했어요. 다시 눌러 주세요."; render(); }
  };
  const join = () => { const c = codeIn.value.trim().toUpperCase(); if (/^[A-Z0-9]{4,8}$/.test(c)) enter(c, nickIn.value); else { errMsg = "가게 코드를 확인해 주세요."; render(); } };
  nickIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) open(); });
  codeIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) join(); });
  return [h("div", { className: "card hero" },
    h("div", { style: "display:grid;gap:18px;min-width:0" },
      h("div", { className: "eyebrow", textContent: "친구들과 · 2~6명 · 로그인 없이" }),
      h("h1", { textContent: "진상 손님을\n2분만 버텨보세요", style: "white-space:pre-line" }),
      h("p", { className: "sub", textContent: "AI가 진상 손님을 연기해요. 한 명씩 돌아가며 말로 달래고, 나머지는 실시간으로 구경하며 리액션을 던져요." }),
      h("ol", { className: "steps" },
        h("li", {}, h("span", {}, h("b", { textContent: "가게를 열고 " }), "링크를 단톡방에 보내요")),
        h("li", {}, h("span", {}, h("b", { textContent: "2분씩 응대 " }), "한마디마다 점수가 붙어요")),
        h("li", {}, h("span", {}, h("b", { textContent: "손님 리뷰 " }), "별점과 누적 순위가 나와요"))),
      h("div", { style: "display:grid;gap:12px" },
        h("div", { className: "entry" }, nickIn, h("button", { className: "btn solid", textContent: "새 가게 열기", onclick: open })),
        h("div", { className: "alt-entry" }, h("span", { textContent: "친구 가게 코드가 있다면" }), codeIn, h("button", { className: "btn", textContent: "입장", onclick: join }))),
      errEl()),
    previewChat())];
}
// 초대 링크로 들어온 친구: 메인과 같은 틀에 "누가 불렀는지 · 누가 와 있는지"
function nickView() {
  const nickIn = nickInput();
  const go = () => enter(code, nickIn.value);
  nickIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) go(); });
  const host = g?.players?.[g.hostId]?.nick;
  const here = online.filter((id) => g?.players?.[id]);
  return [h("div", { className: "card hero" },
    h("div", { style: "display:grid;gap:18px;min-width:0" },
      h("div", { className: "eyebrow", textContent: "초대받은 가게 · " + code }),
      h("h1", { textContent: host ? `${host}님이\n같이 손님 받자고 해요` : "진상 손님 가게에\n초대받았어요", style: "white-space:pre-line" }),
      here.length ? h("div", { className: "row", style: "gap:10px" }, h("span", { className: "faces" }, here.slice(0, 5).map((id) => avatar(id))), h("span", { className: "sub", textContent: `${here.map((id) => g.players[id].nick).slice(0, 3).join(", ")}${here.length > 3 ? ` 외 ${here.length - 3}명` : ""}이 와 있어요` }))
        : h("p", { className: "sub", textContent: g ? "아직 아무도 없어요. 먼저 들어가서 기다려 보세요." : "가게에 연결하는 중…" }),
      h("p", { className: "sub", textContent: "AI가 연기하는 진상 손님을 한 명씩 돌아가며 2분 동안 달래는 게임이에요. 닉네임만 쓰면 바로 직원으로 들어가요." }),
      h("div", { className: "entry" }, nickIn, h("button", { className: "btn solid", textContent: "가게 들어가기", onclick: go })),
      errEl()),
    previewChat())];
}

/* ---------- 지금 가게 ---------- */
function nowView() {
  if (!g) return [h("div", { className: "narrow" }, h("div", { className: "card" }, h("p", { className: "sub", textContent: connected ? "가게 문 여는 중…" : "가게에 연결하는 중…" })))];
  const v = g.phase;
  if (v === "lobby") {
    const joined = g.players[me]?.staff, n = staffIds().length;
    const main = h("div", { className: "card lobby" },
      h("div", { style: "display:grid;gap:4px" },
        h("div", { className: "eyebrow", textContent: "대기실" }),
        h("h2", { textContent: isHost() ? "친구를 부르고 첫 손님을 받아요" : "곧 손님이 들어와요", style: "font-size:22px;letter-spacing:-0.03em" }),
        h("p", { className: "sub", textContent: isHost() ? "모두 들어오면 시작하세요. 늦게 온 친구는 다음 손님부터 같이 해요." : `진행자 ${nameOf(g.hostId)}님이 손님을 받으면 시작돼요.` })),
      inviteBox(),
      isHost() ? h("div", { className: "startrow" },
        h("input", { id: "idea", maxLength: 60, placeholder: "손님이 나타날 장소 (비우면 랜덤)", ariaLabel: "손님이 나타날 장소", value: customIdea, oninput: (e) => { customIdea = e.target.value; } }),
        h("button", { className: "btn solid lg", disabled: !n, textContent: `손님 받기 · ${n}명`, onclick: () => act("newCustomer", { idea: customIdea }) })) : null,
      h("div", { className: "row", style: "justify-content:space-between" },
        h("span", { className: "tiny", textContent: joined ? "나는 직원으로 참가 중" : "나는 구경 중" }),
        h("button", { className: "btn ghost", textContent: joined ? "이번엔 구경만 할게요" : "직원으로 참가", onclick: () => act(joined ? "spectate" : "join") })),
      hostAway(), errEl());
    return [h("div", { className: "shell" }, h("section", { className: "chatcol lobbycol" }, main), h("aside", { className: "side" }, rosterCard("참가자", false)))];
  }
  if (v === "customer" || !g.customer) {
    // 손님 생성 중: 대화 화면과 같은 자리에 뼈대만 (레이아웃 흔들림 방지)
    const sk = h("div", { className: "custbar" }, h("div", { className: "cb-row", style: "cursor:default" },
      h("div", { className: "face skelbox" }), h("div", { className: "cb-main" }, h("span", { className: "cb-name", textContent: "손님이 들어오는 중…" }), h("div", { className: "meter" }, h("i", { className: "skelbar", style: "width:100%" })), h("span", { className: "cb-sub", textContent: "보통 3~10초 걸려요" })), h("span", { className: "clock idle", textContent: fmt(C.TURN_MS) })));
    const thread = h("div", { className: "thread", id: "thread" }, h("div", { className: "mc" }, h("div", { className: "face sm skelbox" }), h("div", { className: "bubble typing" }, h("span"), h("span"), h("span"))));
    const dockEl = h("div", { className: "dock" }, h("div", { className: "panel" }, h("div", { className: "hint" }, h("span", { textContent: "딸랑, 문이 열리고 있어요" }),
      isHost() ? h("button", { className: "btn ghost", textContent: "너무 오래 걸리면 다시 시도", onclick: () => act("newCustomer", { idea: customIdea }) }) : null), errEl() ? h("div", { className: "hint" }, errEl()) : null));
    return [h("div", { className: "shell" }, h("section", { className: "chatcol" }, sk, thread, dockEl), h("aside", { className: "side play" }, rosterCard("근무표 · 누적 점수", true)))];
  }

  const c = g.customer, t = g.turn, live = t?.status === "live";
  const rs = g.roundResults || [], cur = current();
  const anger = live ? t.anger : rs.at(-1)?.anger ?? c.anger;
  const sub = live ? `${nameOf(t.player)} 응대 중 · ${t.points || 0}점 · ${t.msgs.filter((m) => m.f === "p").length}/${C.MAX_LINES}마디`
    : v === "review" ? `${g.round}번째 손님 · 리뷰 도착` : v === "reviewing" ? `${g.round}번째 손님 · 리뷰 쓰는 중` : cur ? `${g.round}번째 손님 · 다음 ${nameOf(cur)}` : `${g.round}번째 손님 · 모두 응대 끝`;
  const clock = live ? h("span", { className: "clock" + (t.thinking ? " paused" : ""), id: "clock", textContent: fmt(remaining(t)) }) : h("span", { className: "clock idle", textContent: fmt(C.TURN_MS) });

  const thread = h("div", { className: "thread", id: "thread" });
  if (!rs.length && !live) thread.append(h("div", { className: "pill", textContent: `${c.name} 손님이 들어왔어요` }));
  rs.forEach((r, i) => thread.append(...doneTurn(r, `${g.round}:${i}`, !live && v === "playing" && i === rs.length - 1)));
  if (live) {
    thread.append(h("div", { className: "pill" }, avatar(t.player, "av sm"), h("b", { textContent: nameOf(t.player) }), "응대 중"), ...bubbles(t.msgs, `${g.round}:${t.player}`, null));
    if (t.thinking) thread.append(h("div", { className: "mc" }, face(t.anger, "face sm"), h("div", { className: "bubble typing" }, h("span"), h("span"), h("span"))));
    if (t.lastError) thread.append(h("p", { className: "pill", style: "color:var(--danger)", textContent: t.lastError }));
  } else if (v === "playing") {
    thread.append(h("div", { className: "pill", textContent: cur ? `다음 차례 · ${nameOf(cur)}` : "모두 응대했어요" }));
  }
  if (v === "review") thread.append(reviewBox(g.review, rs));
  if (v === "reviewing") thread.append(h("div", { className: "pill", textContent: "손님이 리뷰를 쓰는 중…" }), h("div", { className: "mc" }, face(anger, "face sm"), h("div", { className: "bubble typing" }, h("span"), h("span"), h("span"))));

  const side = h("aside", { className: "side play" },
    h("div", { className: "card tight" }, h("span", { className: "h3", textContent: "오늘의 손님" }), ...customerDetails(c), roleLine(c, "border-top:1px solid var(--border);padding-top:10px")),
    rosterCard("근무표 · 누적 점수", true),
    h("div", { className: "card tight" }, h("div", { className: "row", style: "justify-content:space-between" }, h("span", { className: "h3", textContent: "친구 부르기" }), h("span", { className: "code", textContent: code })),
      h("button", { className: "btn block", textContent: "초대 링크 복사", onclick: () => copyLink() }),
      !g.players[me]?.staff ? h("button", { className: "btn solid block", textContent: "다음 손님부터 직원으로 참가", onclick: () => act("join") }) : null));
  return [h("div", { className: "shell" }, h("section", { className: "chatcol" }, custBar(c, anger, sub, clock), thread, dock(v, t, live, cur)), side)];
}

function dock(v, t, live, cur) {
  const kids = [];
  if (live && t.player === me) {
    const ta = h("textarea", { id: "line", maxLength: 200, placeholder: "손님에게 할 말", ariaLabel: "손님에게 할 말", disabled: !!t.thinking,
      onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } } });
    const send = () => { const val = ta.value.trim(); if (val) { ta.value = ""; act("say", { text: val }); stickBottom(true); } };
    kids.push(h("div", { className: "compose" }, ta, h("button", { className: "btn solid icon", ariaLabel: "보내기", disabled: !!t.thinking, onclick: send }, icon("arrow-up", "↑"))));
    kids.push(h("div", { className: "hint" }, h("span", { textContent: t.thinking ? "손님이 생각하는 중 · 시계 멈춤" : "Enter로 보내기 · 생각하는 동안 시계 멈춤" }), h("button", { className: "btn ghost", textContent: "그만하기", onclick: () => act("endTurn") })));
  } else if (live) {
    kids.push(h("div", { className: "reacts" }, h("span", { textContent: `${nameOf(t.player)}님 응대 구경 중` }),
      C.REACTS.map((e) => h("button", { className: "btn", textContent: e, ariaLabel: "리액션 " + e, onclick: () => act("react", { e }) }))));
    if (isHost()) kids.push(h("div", { className: "hint" }, h("span", { textContent: "진행이 멈췄다면" }), h("button", { className: "btn ghost", textContent: "이 차례 끝내기", onclick: () => act("endTurn") })));
  } else if (v === "playing" && cur === me) {
    kids.push(h("button", { className: "btn solid lg block", textContent: "내 차례 · 응대 시작 (2분)", onclick: () => act("start") }));
  } else if (v === "playing" && cur) {
    kids.push(h("div", { className: "hint" }, h("span", { textContent: `${nameOf(cur)}님이 응대를 시작하길 기다리는 중` }), isHost() ? h("button", { className: "btn ghost", textContent: "건너뛰기", onclick: () => act("skip") }) : null));
  } else if (v === "playing") {
    kids.push(isHost() ? h("button", { className: "btn solid lg block", textContent: "손님 리뷰 보기", onclick: () => act("review") }) : h("div", { className: "hint" }, h("span", { textContent: `진행자 ${nameOf(g.hostId)}님이 리뷰를 열면 결과가 나와요.` })));
  } else if (v === "reviewing") {
    kids.push(h("div", { className: "hint" }, h("span", { textContent: "손님이 별점을 고르는 중이에요" }), isHost() ? h("button", { className: "btn ghost", textContent: "너무 오래 걸리면 다시 시도", onclick: () => act("review") }) : null));
  } else if (v === "review") {
    kids.push(isHost()
      ? h("div", { className: "compose" }, h("input", { id: "idea2", maxLength: 60, placeholder: "다음 손님 장소 (비우면 랜덤)", value: customIdea, ariaLabel: "다음 손님 장소", oninput: (e) => { customIdea = e.target.value; } }), h("button", { className: "btn solid", textContent: "다음 손님", onclick: () => act("newCustomer", { idea: customIdea }) }))
      : h("div", { className: "hint" }, h("span", { textContent: `진행자 ${nameOf(g.hostId)}님이 다음 손님을 받으면 이어져요.` })));
  }
  const away = hostAway(); if (away) kids.push(h("div", { className: "hint" }, away));
  const err = errEl(); if (err) kids.push(h("div", { className: "hint" }, err));
  return h("div", { className: "dock" }, h("div", { className: "panel" }, kids));
}

/* ---------- 지난 손님 ---------- */
function pastView() {
  const list = pastRounds();
  const r = pastOpen != null && rounds.find((x) => x.round === pastOpen);
  if (r) {
    const rs = r.results || [];
    const thread = h("div", { className: "thread" });
    rs.forEach((x, i) => thread.append(...doneTurn(x, `p${r.round}:${i}`, true)));
    if (!rs.length) thread.append(h("p", { className: "pill", textContent: "응대 기록이 없어요." }));
    if (r.review) thread.append(reviewBox(r.review, rs));
    return [h("div", { className: "narrow" },
      h("button", { className: "btn ghost", style: "justify-self:start", textContent: "← 지난 손님", onclick: () => { pastOpen = null; render(); } }),
      h("div", { className: "card tight" }, h("div", { className: "row", style: "gap:12px;flex-wrap:nowrap" }, face(rs.at(-1)?.anger ?? r.customer.anger), h("div", { style: "min-width:0" }, h("b", { textContent: r.customer.name }), h("div", { className: "tiny", textContent: `${r.round}번째 손님 · 직원 ${rs.length}명${r.review ? "" : " · 리뷰 전에 끝남"}` }))), ...customerDetails(r.customer)),
      thread)];
  }
  if (!list.length) return [h("div", { className: "narrow" }, h("div", { className: "card" }, h("h2", { textContent: "아직 지난 손님이 없어요", style: "font-size:18px" }), h("p", { className: "sub", textContent: "응대가 하나 끝날 때마다 여기에 쌓여요. 손님을 눌러 그때 대화를 다시 볼 수 있어요." })))];
  return [h("div", { className: "narrow" }, h("div", { className: "card tight" }, h("span", { className: "h3", textContent: `지난 손님 ${list.length}명` }),
    h("div", { className: "list" }, list.map((r) => {
      const mine = (r.results || []).find((x) => x.player === me), last = (r.results || []).at(-1);
      return h("button", { className: "li", onclick: () => { pastOpen = r.round; window.scrollTo(0, 0); render(); } },
        face(last?.anger ?? r.customer?.anger ?? 50, "face sm"),
        h("div", { className: "txt" }, h("b", { textContent: r.customer?.name || "손님" }), h("span", { textContent: r.review?.headline ? `“${r.review.headline}”` : `${r.customer?.place || ""} · 직원 ${(r.results || []).length}명` })),
        mine ? h("span", { className: "sc", textContent: "+" + mine.score }) : h("span", { className: "tiny", textContent: "구경" }));
    }))))];
}

/* ---------- 순위 ---------- */
function rankView() {
  const ids = Object.keys(g?.scores || {}).sort((a, b) => g.scores[b] - g.scores[a]);
  if (!ids.length) return [h("div", { className: "narrow" }, h("div", { className: "card" }, h("h2", { textContent: "아직 순위가 없어요", style: "font-size:18px" }), h("p", { className: "sub", textContent: "첫 손님을 응대하면 누적 점수가 쌓여요." })))];
  const stat = (id) => {
    const turns = rounds.flatMap((r) => (r.results || []).filter((x) => x.player === id));
    const lines = turns.flatMap((x) => (x.msgs || []).filter((m) => m.f === "p" && m.g != null));
    return { n: turns.length, happy: turns.filter((x) => x.endedBy === "happy").length, boom: turns.filter((x) => x.endedBy === "boom").length,
      avg: lines.length ? Math.round(lines.reduce((a, m) => a + m.g, 0) / lines.length * 10) / 10 : 0 };
  };
  return [h("div", { className: "narrow" }, h("div", { className: "card tight" },
    h("span", { className: "h3", textContent: `누적 순위 · 손님 ${g.round}명째` }),
    h("div", { className: "list" }, ids.map((id, i) => {
      const s = stat(id);
      return h("div", { className: "li" }, h("span", { className: "no", textContent: i + 1 }), avatar(id, "av lg"),
        h("div", { className: "txt" }, h("b", { textContent: nameOf(id) }), h("span", { textContent: `응대 ${s.n}번 · 한마디 평균 ${s.avg}점 · 만족 ${s.happy} · 폭발 ${s.boom}` })),
        h("span", { className: "sc", textContent: g.scores[id] + "점" }));
    })),
    h("p", { className: "tiny", textContent: "점수 = 한마디마다 받은 응대 점수 합 + 만족 퇴장 30 + 리액션 보너스(최대 20)" })))];
}

/* ---------- 렌더 ---------- */
function renderTop() {
  const inRoom = code && g && !needNick; // 닉네임 정하기 전(초대 입장 화면)엔 탭·접속자 숨김
  $("tabs").hidden = !inRoom;
  if (inRoom) {
    const n = pastRounds().length;
    $("tabs").replaceChildren(...[["now", "지금 가게"], ["past", "지난 손님"], ["rank", "순위"]].map(([k, label]) =>
      h("button", { className: "tab" + (tab === k ? " on" : ""), ariaPressed: String(tab === k), onclick: () => { tab = k; pastOpen = null; render(); if (k === "now" && isResponder()) stickBottom(true); } },
        label, k === "past" && n ? h("small", { textContent: n }) : null)));
  }
  const fold = !inRoom || !isHost() ? [] : confirmFold
    ? [h("span", { textContent: "가게를 정리할까요?" }), h("button", { className: "btn rust", style: "height:32px", textContent: "정리", onclick: () => { confirmFold = false; act("close"); } }), h("button", { className: "btn", style: "height:32px", textContent: "취소", onclick: () => { confirmFold = false; render(); } })]
    : [h("button", { className: "btn ghost", textContent: "가게 정리", title: "점수와 진행 중인 손님을 지우고 대기실로 (지난 손님 기록은 남아요)", onclick: () => { confirmFold = true; render(); } })];
  $("status").replaceChildren(...[inRoom ? h("span", { className: "faces" }, online.slice(0, 4).map((id) => avatar(id, "av sm"))) : null, inRoom ? `${online.length}명` : null, inRoom && !connected ? h("span", { className: "err", textContent: "재연결 중" }) : null].filter(Boolean), ...fold);
}
function render() {
  renderTop();
  const view = $("view");
  const focused = document.activeElement?.id;
  const typed = Object.fromEntries([...view.querySelectorAll("input,textarea")].map((el) => [el.id, el.value]));
  const wasNear = nearBottom();
  view.replaceChildren(...(!code ? homeView() : needNick ? nickView() : tab === "past" ? pastView() : tab === "rank" ? rankView() : nowView()).filter(Boolean));
  for (const [id, val] of Object.entries(typed)) { const el = $(id); if (el && val && !el.readOnly) el.value = val; }
  if (focused && $(focused) && !$(focused).disabled) $(focused).focus({ preventScroll: true });
  if (tab === "now" && g?.turn?.status === "live" && (wasNear || isResponder())) stickBottom(true);
}
$("brand-ic").replaceChildren(icon("store", ""));
// 초대 링크로 처음 온 사람은 닉네임부터. 방 상태는 미리 받아서 누가 있는지 보여준다
let needNick = !!code && !nick;
if (code) connect();
addEventListener("popstate", () => location.reload());
render();
