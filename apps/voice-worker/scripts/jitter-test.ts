/**
 * Teste de Jitter — conecta dois clientes Ts3Client reais ao servidor TeamSpeak 6,
 * um fala (sine wave) o outro ouve, e mede:
 *   - inter-arrival time dos frames de voz
 *   - jitter (média do desvio absoluto entre inter-arrivals)
 *   - frames perdidos / fora de ordem
 *   - pacotes recebidos por segundo
 *
 * Uso:
 *   TS6_VOICE_HOST=127.0.0.1 TS6_VOICE_PORT=9987 \
 *   npm run test:jitter --workspace apps/voice-worker
 */
import { Ts3Client } from 'ts6-client';
import { generateIdentity } from 'ts6-client';

const HOST = process.env.TS6_VOICE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.TS6_VOICE_PORT || '9987', 10);
const PASSWORD = process.env.TS6_SERVER_PASSWORD || '';
const CHANNEL = process.env.TS6_SMOKE_CHANNEL || '1';
const DURATION_MS = parseInt(process.env.TS6_JITTER_DURATION_MS || '15000', 10);
const FRAME_MS = 20; // frame de voz de 20ms

const framesReceived: number[] = [];
let lastArrival: number | null = null;
let outOfOrder = 0;
let lastSeq = -1;
let lateFrames = 0;
let totalReceived = 0;

function reportPartial() {
  const now = Date.now();
  const interval = now - (lastArrival ?? now - 1000);
  const rate = interval > 0 ? (totalReceived * 1000) / interval : 0;

  // Jitter: média do |delta - esperado(20ms)|
  let jitterSum = 0;
  let jitterCount = 0;
  for (let i = 1; i < framesReceived.length; i++) {
    const delta = framesReceived[i] - framesReceived[i - 1];
    jitterSum += Math.abs(delta - FRAME_MS);
    jitterCount++;
  }
  const jitterMs = jitterCount > 0 ? jitterSum / jitterCount : 0;

  console.log(
    `  📊 pacotes=${totalReceived} (${rate.toFixed(1)}/s) | jitter=${jitterMs.toFixed(2)}ms | ` +
    `outOfOrder=${outOfOrder} | lateFrames=${lateFrames} | interArrival50ms=${(framesReceived.slice(-50).reduce((a, b, i, arr) => i ? a + (b - arr[i - 1]) : a, 0) / Math.min(50, framesReceived.length)).toFixed(1)}ms`
  );
}

async function main() {
  console.log(`=================================================`);
  console.log(`⏱️  TESTE DE JITTER — TeamSpeak 6 Voice`);
  console.log(`   Host: ${HOST}:${PORT} | Canal: ${CHANNEL}`);
  console.log(`   Durata: ${DURATION_MS}ms | Frame: ${FRAME_MS}ms`);
  console.log(`=================================================\n`);

  // Cliente A: fala (talks)
  const speaker = new Ts3Client();
  const speakerIdentity = generateIdentity(8);

  // Cliente B: ouve (listener) — mede jitter
  const listener = new Ts3Client();
  const listenerIdentity = generateIdentity(8);

  let speakerClid: number | null = null;
  const opusEncoder = (await import('opusscript')).default;
  const enc = new opusEncoder(48000, 2, opusEncoder.Application.AUDIO);

  let framesSent = 0;
  const startRef = Date.now();

  function makeSineFrameStereo(sampleRate = 48000, freq = 440) {
    const mono = Buffer.alloc(960 * 2);
    for (let i = 0; i < 960; i++) {
      const sample = Math.round(Math.sin((i * 2 * Math.PI * freq) / sampleRate) * 1200);
      mono.writeInt16LE(sample, i * 2);
    }
    const stereo = Buffer.alloc(mono.length * 2);
    for (let i = 0; i < 960; i++) {
      const s = mono.readInt16LE(i * 2);
      stereo.writeInt16LE(s, i * 4);
      stereo.writeInt16LE(s, i * 4 + 2);
    }
    return stereo;
  }

  speaker.on('connected', () => {
    speakerClid = speaker.getClientId();
    console.log(`🔊 Speaker conectado: clid=${speakerClid}\n`);

    // Envia frames a cada 20ms
    const talkTimer = setInterval(() => {
      const encoded = enc.encode(makeSineFrameStereo(), 960);
      if (encoded && encoded.length > 0) {
        speaker.sendVoice(Buffer.from(encoded));
        framesSent++;
      }
    }, FRAME_MS);

    setTimeout(() => clearInterval(talkTimer), DURATION_MS);
  });

  listener.on('connected', () => {
    console.log(`🎧 Listener conectado: clid=${listener.getClientId()}\n`);
    console.log(`Iniciando medição por ${DURATION_MS}ms...\n`);
  });

  listener.on('voice', (data: Buffer) => {
    const now = Date.now();
    totalReceived++;

    if (lastArrival !== null) {
      const delta = now - lastArrival;
      if (delta > FRAME_MS * 1.5) lateFrames++; // frame "atrasado" (inter-arrival > 30ms)
    }
    lastArrival = now;
    framesReceived.push(now);

    // Detecção de fora de ordem via seq implícito
    // (TS6 não manda seq direto; usamos o padrão de chegada)
    if (framesReceived.length >= 2 && framesReceived[framesReceived.length - 1] < framesReceived[framesReceived.length - 2]) {
      outOfOrder++;
    }

    // Reporta a cada 2s
    if (totalReceived % 100 === 0) {
      reportPartial();
    }
  });

  listener.on('error', (err: any) => console.error(`❌ Listener erro:`, err.message || err));
  speaker.on('error', (err: any) => console.error(`❌ Speaker erro:`, err.message || err));

  await Promise.all([
    speaker.connect({ host: HOST, port: PORT, serverPassword: PASSWORD, nickname: 'Jitter_Speaker', identity: speakerIdentity, defaultChannel: CHANNEL }),
    listener.connect({ host: HOST, port: PORT, serverPassword: PASSWORD, nickname: 'Jitter_Listener', identity: listenerIdentity, defaultChannel: CHANNEL }),
  ]);

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS + 2000));

  // Relatório final
  const elapsed = (Date.now() - startRef) / 1000;
  let jitterSum = 0;
  let jitterCount = 0;
  for (let i = 1; i < framesReceived.length; i++) {
    const delta = framesReceived[i] - framesReceived[i - 1];
    jitterSum += Math.abs(delta - FRAME_MS);
    jitterCount++;
  }
  const avgJitterMs = jitterCount > 0 ? jitterSum / jitterCount : 0;
  const expectedFrames = Math.round(DURATION_MS / FRAME_MS);
  const lossPct = expectedFrames > 0 ? Math.max(0, ((expectedFrames - totalReceived) / expectedFrames) * 100) : 0;

  console.log(`\n=================================================`);
  console.log(`📋 RELATÓRIO FINAL DE JITTER`);
  console.log(`=================================================`);
  console.log(`  Frames enviados (speaker):     ${framesSent}`);
  console.log(`  Frames recebidos (listener):   ${totalReceived}`);
  console.log(`  Frames esperados (~${expectedFrames}):        ${expectedFrames}`);
  console.log(`  Perda estimada:                ${lossPct.toFixed(2)}%`);
  console.log(`  Jitter médio (|Δ - 20ms|):     ${avgJitterMs.toFixed(2)}ms`);
  console.log(`  Frames tardios (>30ms gap):    ${lateFrames}`);
  console.log(`  Fora de ordem:                 ${outOfOrder}`);
  console.log(`  Taxa média de recepção:        ${(totalReceived / elapsed).toFixed(1)} pacotes/s`);
  console.log(`=================================================`);

  speaker.disconnect();
  listener.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});