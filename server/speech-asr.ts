/** Provider transport for the relay's common cumulative ASR transcript. */
import { WebSocket } from "ws";
import {
  BIGMODEL_ASR_URL, buildBigModelFullRequest, buildBigModelAudioRequest,
  parseAsrResponse, type BigModelAsrConfig, type AsrResponse, type AsrUtterance,
} from "./volcengine-asr";

interface DashscopeState {
  taskId: string;
  ready: boolean;
  finished: boolean;
  settled: AsrUtterance[];
}
const sessions = new WeakMap<WebSocket, DashscopeState>();

export function createSpeechAsrSocket(headers: Record<string, string>): WebSocket {
  const provider = process.env.ASR_PROVIDER || "volcengine";
  if (provider === "volcengine") return new WebSocket(BIGMODEL_ASR_URL, { headers });
  if (provider !== "dashscope") throw new Error("Unsupported ASR_PROVIDER");
  if (!process.env.DASHSCOPE_API_KEY) throw new Error("Missing DASHSCOPE_API_KEY");
  const ws = new WebSocket(process.env.DASHSCOPE_ASR_WS_URL || "wss://dashscope.aliyuncs.com/api-ws/v1/inference", {
    headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
  });
  sessions.set(ws, { taskId: "", ready: false, finished: false, settled: [] });
  return ws;
}

export async function startSpeechAsr(ws: WebSocket, config: BigModelAsrConfig, taskId: string): Promise<void> {
  const state = sessions.get(ws);
  if (!state) { ws.send(buildBigModelFullRequest(config, taskId)); return; }
  state.taskId = taskId;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); ws.off("message", onMessage); ws.off("close", onClose); ws.off("error", onError); };
    const fail = (err: Error) => { cleanup(); ws.close(); reject(err); };
    const onClose = () => fail(new Error("DashScope closed before task-started"));
    const onError = (err: Error) => fail(err);
    const onMessage = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.header?.event === "task-started") { state.ready = true; cleanup(); resolve(); }
        else if (msg.header?.event === "task-failed") fail(new Error(`DashScope: ${msg.header.error_message || msg.header.error_code}`));
      } catch (err) { fail(err instanceof Error ? err : new Error(String(err))); }
    };
    const timer = setTimeout(() => fail(new Error("DashScope task-started timeout")), 10_000);
    ws.on("message", onMessage); ws.on("close", onClose); ws.on("error", onError);
    ws.send(JSON.stringify({
      header: { action: "run-task", task_id: taskId, streaming: "duplex" },
      payload: { task_group: "audio", task: "asr", function: "recognition",
        model: process.env.DASHSCOPE_ASR_MODEL || "fun-asr-realtime",
        parameters: { format: "pcm", sample_rate: 16000 }, input: {} },
    }));
  });
}

export function sendSpeechAsrAudio(ws: WebSocket, audio: Buffer, sequence: number, isLast = false): void {
  const state = sessions.get(ws);
  if (!state) { ws.send(buildBigModelAudioRequest(audio, sequence, isLast)); return; }
  if (!state.ready || state.finished) return;
  if (audio.length) ws.send(audio);
  if (isLast) {
    state.finished = true;
    ws.send(JSON.stringify({ header: { action: "finish-task", task_id: state.taskId, streaming: "duplex" }, payload: { input: {} } }));
  }
}

export function parseSpeechAsrResponse(ws: WebSocket, data: Buffer): AsrResponse {
  const state = sessions.get(ws);
  if (!state) return parseAsrResponse(data);
  const msg = JSON.parse(data.toString());
  if (msg.header?.event === "task-failed") {
    return { messageType: 15, errorCode: -1, errorMessage: msg.header.error_message || msg.header.error_code || "DashScope task failed" };
  }
  const sentence = msg.payload?.output?.sentence;
  if (!sentence?.text || sentence.heartbeat) return { messageType: 9 };
  const utterance: AsrUtterance = {
    text: sentence.text, definite: !!sentence.sentence_end,
    start_time: sentence.begin_time ?? state.settled.length,
    end_time: sentence.end_time ?? state.settled.length + 1,
  };
  // DashScope sends individual sentences; relay endpointing expects the entire ASR session.
  if (utterance.definite) {
    const previous = state.settled.at(-1);
    if (!previous || previous.start_time !== utterance.start_time || previous.text !== utterance.text) state.settled.push(utterance);
  }
  const utterances = utterance.definite ? [...state.settled] : [...state.settled, utterance];
  return { messageType: 9, text: utterances.map(u => u.text).join(" "), utterances };
}
