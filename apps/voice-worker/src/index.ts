import { parentPort } from 'worker_threads';
import { info } from 'logger';
import { VoiceBridge } from './voiceBridge.js';

info("Voice Worker inicializado");

// Configuração injetada pelo posto de controle (env)
const TS6_VOICE_HOST = process.env.TS6_VOICE_HOST || '127.0.0.1';
const TS6_VOICE_PORT = parseInt(process.env.TS6_VOICE_PORT || '9987', 10);
const TS6_SERVER_PASSWORD = process.env.TS6_SERVER_PASSWORD || '';

class JitterBuffer { /* stub: implementação real no cliente */ }
class VAD { /* stub */ }

const bridge = new VoiceBridge(TS6_VOICE_HOST, TS6_VOICE_PORT, TS6_SERVER_PASSWORD, (userId, event) => {
    parentPort?.postMessage({ type: 'VOICE_EVENT', payload: { userId, event } });
});

parentPort?.on('message', (msg: any) => {
    const { type, payload } = msg || {};

    switch (type) {
        case 'CREATE_SESSION': {
            info(`Voice Session Criada: ${payload?.sessionId}`);
            parentPort?.postMessage({ type: 'ACK', status: 'OK', for: 'CREATE_SESSION' });
            break;
        }
        case 'CONNECT': {
            const { id, correlationId, nickname, channelId, audioWsUrl } = payload || {};
            info(`[CONNECT] Registrando mic virtual: ${nickname} (canal ${channelId})`);
            const user = bridge.registerUser(id, correlationId, nickname, channelId);
            parentPort?.postMessage({ type: 'CONNECTED', payload: { userId: id, status: 'OK' } });
            break;
        }
        case 'MIC_DATA': {
            // Áudio PCM do microfone web -> codifica Opus -> envia ao TS6
            const { userId, pcm } = payload || {};
            if (pcm) {
                bridge.broadcastAudio(userId, Buffer.from(pcm));
            }
            break;
        }
        case 'SET_MUTE': {
            const { userId, isMuted, isDeafened } = payload || {};
            bridge.setMuteState(userId, isMuted, isDeafened);
            parentPort?.postMessage({ type: 'ACK', status: 'OK', for: 'SET_MUTE' });
            break;
        }
        case 'SET_TALKING': {
            const { userId, isTalking } = payload || {};
            bridge.setTalkingState(userId, isTalking);
            parentPort?.postMessage({ type: 'ACK', status: 'OK', for: 'SET_TALKING' });
            break;
        }
        case 'MOVE': {
            const { userId, channelId } = payload || {};
            bridge.moveUser(userId, channelId);
            parentPort?.postMessage({ type: 'ACK', status: 'OK', for: 'MOVE' });
            break;
        }
        case 'DISCONNECT': {
            const { userId } = payload || {};
            bridge.removeUser(userId);
            parentPort?.postMessage({ type: 'DISCONNECTED', payload: { userId } });
            break;
        }
        case 'PING': {
            parentPort?.postMessage({ type: 'PONG', ts: Date.now() });
            break;
        }
        default:
            parentPort?.postMessage({ type: 'UNKNOWN', for: type });
    }
});
