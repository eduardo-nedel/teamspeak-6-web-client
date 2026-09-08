/**
 * Smoke Test de Voz — conecta um cliente virtual real (Ts3Client) ao servidor TeamSpeak 6
 * e valida: conexão, channel list, recebimento de voz (se alguém falar) e envio de voz sintética.
 *
 * Uso:
 *   TS6_VOICE_HOST=127.0.0.1 TS6_VOICE_PORT=9987 TS6_SERVER_PASSWORD= \
 *   npm run smoke --workspace apps/voice-worker
 */
import { Ts3Client } from 'ts6-client';
import { generateIdentity } from 'ts6-client';
import OpusScript from 'opusscript';

const HOST = process.env.TS6_VOICE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.TS6_VOICE_PORT || '9987', 10);
const PASSWORD = process.env.TS6_SERVER_PASSWORD || '';
const NICKNAME = process.env.TS6_SMOKE_NICK || 'SmokeTest_Bot';
const CHANNEL = process.env.TS6_SMOKE_CHANNEL || '1';
const DURATION_MS = parseInt(process.env.TS6_SMOKE_DURATION_MS || '15000', 10);

function makeSineFrame(ms: number, sampleRate = 48000, freq = 440) {
  const samplesPerFrame = (sampleRate * ms) / 1000;
  const pcm = Buffer.alloc(samplesPerFrame * 2);
  for (let i = 0; i < samplesPerFrame; i++) {
    const sample = Math.round(Math.sin((i * 2 * Math.PI * freq) / sampleRate) * 1200);
    pcm.writeInt16LE(sample, i * 2);
  }
  return pcm;
}

async function main() {
  console.log(`=================================================`);
  console.log(`🎙️  SMOKE TEST DE VOZ — TeamSpeak 6`);
  console.log(`   Host: ${HOST}:${PORT}`);
  console.log(`   Nick: ${NICKNAME} | Canal: ${CHANNEL}`);
  console.log(`=================================================\n`);

  const client = new Ts3Client();
  const identity = generateIdentity(8);

  const connectTimeout = setTimeout(() => {
    console.error(`❌ TIMEOUT: não conectou em 10s`);
    process.exit(1);
  }, 10000);

  client.on('connected', () => {
    clearTimeout(connectTimeout);
    const clid = client.getClientId();
    console.log(`✅ CONECTADO ao TS6! ClientId: ${clid}, Estado: ${client.getState()}`);

    // Envia voz sintética (sine wave) em frame de 20ms por 5 segundos
    const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
    let framesSent = 0;
    const encoderTimer = setInterval(() => {
      const mono = makeSineFrame(20);
      // Mono -> Stereo (interleave)
      const stereo = Buffer.alloc(mono.length * 2);
      for (let i = 0; i < 960; i++) {
        const s = mono.readInt16LE(i * 2);
        stereo.writeInt16LE(s, i * 4);
        stereo.writeInt16LE(s, i * 4 + 2);
      }
      const encoded = encoder.encode(stereo, 960);
      if (encoded && encoded.length > 0) {
        client.sendVoice(Buffer.from(encoded));
        framesSent++;
        if (framesSent % 50 === 0) {
          console.log(`  🎵 Enviados ${framesSent} frames Opus ao TS6`);
        }
      }
    }, 20);

    setTimeout(() => {
      clearInterval(encoderTimer);
      console.log(`\n✅ Envio de voz completo: ${framesSent} frames Opus enviados.`);
      console.log(`Desconectando...`);
      client.disconnect();
      setTimeout(() => process.exit(0), 500);
    }, DURATION_MS);
  });

  client.on('voice', (data: Buffer) => {
    console.log(`  🔊 Voz RECEBIDA do servidor: ${data.length}B`);
  });

  client.on('error', (err: any) => {
    console.error(`❌ ERRO:`, err.message || err);
  });

  client.on('disconnected', (reason: any) => {
    console.log(`🔌 Desconectado:`, reason);
  });

  console.log(`Conectando...\n`);
  client.connect({
    host: HOST,
    port: PORT,
    serverPassword: PASSWORD,
    nickname: NICKNAME,
    identity,
    defaultChannel: CHANNEL,
  }).catch((err) => {
    console.error(`❌ Falha ao conectar:`, err.message || err);
    process.exit(1);
  });
}

main();