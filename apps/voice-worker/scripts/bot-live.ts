import { Ts3Client } from 'ts6-client';
import { generateIdentity } from 'ts6-client';
import OpusScript from 'opusscript';

const HOST = process.env.TS6_VOICE_HOST || '168.138.127.76';
const PORT = parseInt(process.env.TS6_VOICE_PORT || '9987', 10);
const PASSWORD = process.env.TS6_SERVER_PASSWORD || 'eiros';
const NICKNAME = process.env.TS6_NICK || 'Antigravity_AI';
const CHANNEL = process.env.TS6_CHANNEL || '1';

console.log(`=================================================`);
console.log(`🚀 Conectando Antigravity AI ao TeamSpeak 6...`);
console.log(`   Servidor: ${HOST}:${PORT}`);
console.log(`   Senha: ${PASSWORD ? '******' : '(nenhuma)'}`);
console.log(`   Nickname: ${NICKNAME}`);
console.log(`=================================================\n`);

const client = new Ts3Client();
const identity = generateIdentity(8);
const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);

// Melodia agradável (frequências em Hz das notas musicais)
const melody = [
  261.63, // C4
  329.63, // E4
  392.00, // G4
  523.25, // C5
  392.00, // G4
  329.63, // E4
  261.63, // C4
  440.00, // A4
  349.23, // F4
  523.25, // C5
];

let noteIndex = 0;
let noteTick = 0;
let currentPhase = 0;

function generateAudioFrame(): Buffer {
  const sampleRate = 48000;
  const samplesPerFrame = 960; // 20ms a 48kHz
  const currentFreq = melody[noteIndex];

  // Alterna a nota a cada 10 frames (200ms por nota)
  noteTick++;
  if (noteTick >= 10) {
    noteTick = 0;
    noteIndex = (noteIndex + 1) % melody.length;
  }

  const stereo = Buffer.alloc(samplesPerFrame * 4); // 960 * 2 canais * 2 bytes = 3840 bytes

  for (let i = 0; i < samplesPerFrame; i++) {
    // Onda senoidal suave com envelope
    const sample = Math.round(Math.sin(currentPhase) * 4500);
    currentPhase += (2 * Math.PI * currentFreq) / sampleRate;
    if (currentPhase > 2 * Math.PI) {
      currentPhase -= 2 * Math.PI;
    }

    stereo.writeInt16LE(sample, i * 4);     // Canal Esquerdo
    stereo.writeInt16LE(sample, i * 4 + 2); // Canal Direito
  }

  return stereo;
}

client.on('connected', () => {
  const clid = client.getClientId();
  console.log(`\n🎉 [CONECTADO COM SUCESSO!]`);
  console.log(`   ClientId no TS: ${clid}`);
  console.log(`   Estado: ${client.getState()}`);
  console.log(`   Iniciando transmissão de áudio (melodia contínua)...\n`);

  let framesSent = 0;

  const voiceTimer = setInterval(() => {
    try {
      const pcmStereo = generateAudioFrame();
      const encoded = encoder.encode(pcmStereo, 960);
      if (encoded && encoded.length > 0) {
        client.sendVoice(Buffer.from(encoded));
        framesSent++;
        if (framesSent % 100 === 0) {
          console.log(`🎵 [TRANSMITINDO] ${framesSent} frames enviados (~${(framesSent * 0.02).toFixed(1)}s de áudio no canal)`);
        }
      }
    } catch (err: any) {
      console.error('Erro ao enviar frame:', err.message);
    }
  }, 20); // 20ms por frame

  // Trata encerramento com limpeza
  const handleExit = () => {
    console.log('\n🛑 Encerrando transmissão de voz...');
    clearInterval(voiceTimer);
    try {
      client.sendVoiceStop();
      client.disconnect();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
});

client.on('voice', (voiceData: Buffer) => {
  if (voiceData.length > 5) {
    const fromClid = voiceData.readUInt16BE(2);
    console.log(`🔊 [VOZ RECEBIDA] Alguém está falando no canal! (Clid: ${fromClid}, Tamanho: ${voiceData.length} bytes)`);
  }
});

client.on('error', (err: any) => {
  console.error(`❌ [ERRO NO TS3CLIENT]:`, err.message || err);
});

client.on('disconnected', (reason: any) => {
  console.log(`🔌 [DESCONECTADO DO SERVIDOR]:`, reason);
});

// Inicia a conexão
client.connect({
  host: HOST,
  port: PORT,
  serverPassword: PASSWORD,
  nickname: NICKNAME,
  identity,
  defaultChannel: CHANNEL,
}).catch((err: any) => {
  console.error(`❌ Falha ao conectar no TeamSpeak:`, err.message || err);
});
