import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { createSpeechAsrSocket, startSpeechAsr, sendSpeechAsrAudio, parseSpeechAsrResponse } from "../server/speech-asr";

test("DashScope waits for task readiness, streams raw PCM, accumulates sentences and finishes once", async () => {
  const names = ["ASR_PROVIDER", "DASHSCOPE_API_KEY", "DASHSCOPE_ASR_MODEL", "DASHSCOPE_ASR_WS_URL"];
  const previous = names.map(n => process.env[n]);
  const server = new WebSocketServer({ port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, { ASR_PROVIDER: "dashscope", DASHSCOPE_API_KEY: "test-key", DASHSCOPE_ASR_MODEL: "test-model", DASHSCOPE_ASR_WS_URL: `ws://127.0.0.1:${address.port}` });
  const socket = createSpeechAsrSocket({ "X-Api-Key": "must-not-leak" });
  try {
    const [peer, request] = await once(server, "connection");
    assert.equal(request.headers.authorization, "Bearer test-key");
    assert.equal(request.headers["x-api-key"], undefined);
    await once(socket, "open");
    const frame = once(peer, "message");
    const ready = startSpeechAsr(socket, { format: "pcm", rate: 16000 }, "task-test");
    const [data] = await frame;
    const command = JSON.parse(data.toString());
    assert.equal(command.header.action, "run-task");
    assert.equal(command.payload.model, "test-model");
    let completed = false; void ready.then(() => { completed = true; });
    assert.equal(completed, false);
    peer.send(JSON.stringify({ header: { event: "task-started" } }));
    await ready;
    const audioFrame = once(peer, "message");
    const pcm = Buffer.from([1, 0, 2, 0]);
    sendSpeechAsrAudio(socket, pcm, 2);
    const [audio, binary] = await audioFrame;
    assert.equal(binary, true); assert.deepEqual(audio, pcm);
    const response = (text: string, end: boolean, start: number) => Buffer.from(JSON.stringify({ payload: { output: { sentence: { text, sentence_end: end, begin_time: start } } } }));
    assert.equal(parseSpeechAsrResponse(socket, response("你好", true, 0)).text, "你好");
    assert.equal(parseSpeechAsrResponse(socket, response("你好", true, 0)).text, "你好");
    const interim = parseSpeechAsrResponse(socket, response("我是候选人", false, 1000));
    assert.equal(interim.text, "你好 我是候选人");
    assert.equal(interim.utterances?.at(-1)?.definite, false);
    assert.equal(parseSpeechAsrResponse(socket, response("我是候选人。", true, 1000)).utterances?.length, 2);
    const failure = parseSpeechAsrResponse(socket, Buffer.from('{"header":{"event":"task-failed","error_message":"quota exceeded"}}'));
    assert.equal(failure.errorMessage, "quota exceeded");
    const finishFrame = once(peer, "message");
    sendSpeechAsrAudio(socket, Buffer.alloc(0), 3, true);
    const [finish] = await finishFrame;
    assert.equal(JSON.parse(finish.toString()).header.action, "finish-task");
  } finally {
    socket.terminate(); for (const peer of server.clients) peer.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    names.forEach((n,i) => { if (previous[i] === undefined) delete process.env[n]; else process.env[n] = previous[i]; });
  }
});
