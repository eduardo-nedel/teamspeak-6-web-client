import { parentPort } from 'worker_threads';
import { info } from 'logger';

info("Voice Worker inicializado");
class JitterBuffer { /* stub */ }
class VAD { /* stub */ }

parentPort?.on('message', (msg: any) => {
    if (msg.type === 'CREATE_SESSION') {
        info(`Voice Session Criada: ${msg.payload.sessionId}`);
        parentPort?.postMessage({ type: 'ACK', status: 'OK' });
    }
});
