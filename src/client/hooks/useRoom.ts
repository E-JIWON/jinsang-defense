import { useCallback, useEffect, useRef, useState } from "react";
import type { Reaction, Round } from "../../shared/game";
import type { ClientMessage, GameState, ServerMessage } from "../../shared/protocol";
import { loadToken } from "../lib/storage";
import { toast } from "../lib/toast";

export type Floaty = { id: number; e: Reaction; left: number };

const token = loadToken();
const OUTBOX_MAX = 5;

const nameIn = (g: GameState, me: string | null, id: string) => (id === me ? "나" : g.players[id]?.nick || "누군가");

/**
 * 방 하나에 붙는 웹소켓. nick이 있을 때만 hello를 보내 입장하고,
 * 그 전에는 누가 와 있는지만 받아 본다(초대 입장 화면).
 */
export function useRoom(code: string | null, nick: string | null) {
  const [g, setG] = useState<GameState | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [floaties, setFloaties] = useState<Floaty[]>([]);

  const ws = useRef<WebSocket | null>(null);
  // 서버가 'you'로 나를 확인하기 전(입장 직후·재연결 중)에 누른 동작은 모아 뒀다가 보낸다.
  const known = useRef(false);
  const outbox = useRef<string[]>([]);
  const latest = useRef({ g, online, me });
  latest.current = { g, online, me };

  useEffect(() => {
    if (!code) return;
    let socket: WebSocket;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;

    const onMessage = (m: ServerMessage) => {
      switch (m.type) {
        case "you":
          known.current = true;
          // 바로 뒤따라오는 state를 렌더 전에 처리하므로, 내 입장을 남의 입장으로 알리지 않게 즉시 기록한다.
          latest.current.me = m.id;
          setMe(m.id);
          while (outbox.current.length) socket.send(outbox.current.shift() as string);
          return;
        case "rounds":
          setRounds(m.rounds);
          return;
        case "state": {
          const { g: prev, online: prevOnline, me: meId } = latest.current;
          const t = m.g.turn;
          const pt = prev?.turn;
          const name = (id: string) => nameIn(m.g, meId, id);
          if (t?.status === "done" && pt?.status === "live" && t.player === pt.player) toast(`${name(t.player)} 응대 끝 · +${t.score}`);
          // prev가 없으면 막 들어온 것이라 진행 중인 일을 새 소식처럼 띄우지 않는다.
          if (prev && t?.status === "live" && pt?.status !== "live" && t.player !== meId) toast(`${name(t.player)}님 응대 시작`);
          if (prev) for (const id of m.online) if (!prevOnline.includes(id) && id !== meId) toast(`${name(id)}님이 들어왔어요`);
          setG(m.g);
          setOnline(m.online);
          setError("");
          return;
        }
        case "react": {
          const f = { id: Math.random(), e: m.e, left: 10 + Math.random() * 80 };
          setFloaties((fs) => [...fs, f]);
          setTimeout(() => setFloaties((fs) => fs.filter((x) => x !== f)), 1900);
          return;
        }
        case "error":
          setError(m.msg);
      }
    };

    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}`);
      ws.current = socket;
      socket.onopen = () => {
        retry = 0;
        known.current = false;
        setConnected(true);
      };
      // 방을 옮기거나 StrictMode로 다시 연결하면 닫힌 옛 소켓의 이벤트가 늦게 올 수 있다.
      socket.onmessage = (ev) => {
        if (ws.current === socket) onMessage(JSON.parse(ev.data));
      };
      socket.onclose = () => {
        if (ws.current !== socket) return;
        setConnected(false);
        if (!disposed) timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(timer);
      ws.current = null;
      socket.close();
      known.current = false;
      outbox.current = [];
      setConnected(false);
      setG(null);
      setRounds([]);
      setOnline([]);
      setError("");
    };
  }, [code]);

  // 연결될 때마다(재연결 포함) 다시 인사해야 서버가 이 소켓이 누구인지 안다.
  useEffect(() => {
    if (connected && nick) ws.current?.send(JSON.stringify({ type: "hello", token, nick } satisfies ClientMessage));
  }, [connected, nick]);

  const act = useCallback((msg: ClientMessage) => {
    const s = JSON.stringify(msg);
    const open = ws.current?.readyState === WebSocket.OPEN;
    if (open && known.current) return ws.current?.send(s);
    outbox.current.push(s);
    if (outbox.current.length > OUTBOX_MAX) outbox.current.shift();
    if (!open) toast("다시 연결하는 중이에요. 연결되면 바로 보낼게요");
  }, []);

  const nameOf = (id: string | null | undefined) => (g && id ? nameIn(g, me, id) : "누군가");

  // 서버가 이 방에 나를 등록해야 진행자 여부가 확정된다. 그 전에 그리면 진행자 화면과 손님 화면이 번갈아 깜빡인다.
  const joined = !!g && !!me && !!g.players[me];
  return { code, g, rounds, online, me, joined, connected, error, floaties, act, nameOf, isHost: joined && g?.hostId === me };
}

export type RoomApi = ReturnType<typeof useRoom>;
