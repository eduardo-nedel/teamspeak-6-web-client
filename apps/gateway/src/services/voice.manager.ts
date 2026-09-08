import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class VoiceManager {
    private worker: Worker;

    constructor() {
        // Usa o código em build
        const workerPath = path.resolve(__dirname, '../../voice-worker/dist/index.js');
        this.worker = new Worker(workerPath);
        this.worker.on('message', (msg) => console.log('[VoiceManager] ACK:', msg));
    }

    createSession(sessionId: string) {
        this.worker.postMessage({ type: 'CREATE_SESSION', payload: { sessionId } });
    }
}
export const voiceManager = new VoiceManager();
