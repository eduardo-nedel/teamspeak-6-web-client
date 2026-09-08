import { Session } from '../models/session.model.js';

export class SessionRepository {
    private store = new Map<string, Session>();

    createSession(session: Session): void {
        this.store.set(session.sessionId, session);
    }

    getSession(sessionId: string): Session | undefined {
        const session = this.store.get(sessionId);
        if (session) {
            if (Date.now() > session.expiresAt) {
                this.store.delete(sessionId);
                return undefined;
            }
            return session;
        }
        return undefined;
    }

    deleteSession(sessionId: string): void {
        this.store.delete(sessionId);
    }

    // Limpeza de expirações periodica
    pruneExpired(): void {
        const now = Date.now();
        for (const [key, session] of this.store.entries()) {
            if (now > session.expiresAt) {
                this.store.delete(key);
            }
        }
    }
}

export const sessionRepository = new SessionRepository();
// Executa o prune a cada minuto
setInterval(() => sessionRepository.pruneExpired(), 60000).unref();
