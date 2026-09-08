import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { LoginRequestDto } from '../dto/auth.dto.js';

export class AuthService {
    
    public login(dto: LoginRequestDto) {
        // Stub: Em produção real isso validaria com um DB ou ActiveDirectory.
        // Aqui mockamos login aceitando qualquer senha não vazia.
        if (!dto.password || dto.password.length === 0) {
            return {
                error: { code: 'UNAUTHORIZED', message: 'Credenciais inválidas.', retryable: false }
            };
        }

        const sessionId = randomUUID();
        const userId = randomUUID();
        const now = Date.now();
        const ttlMs = 24 * 60 * 60 * 1000; // 24h

        const session = {
            sessionId,
            userId,
            username: dto.username,
            createdAt: now,
            expiresAt: now + ttlMs
        };

        sessionRepository.createSession(session);

        const token = jwt.sign({ 
            sub: userId, 
            username: dto.username, 
            sessionId 
        }, env.JWT_SECRET, { expiresIn: '24h' });

        return {
            token,
            user: { userId, username: dto.username }
        };
    }

    public logout(sessionId: string) {
        sessionRepository.deleteSession(sessionId);
    }

    public validateToken(token: string) {
        try {
            const payload = jwt.verify(token, env.JWT_SECRET) as any;
            const session = sessionRepository.getSession(payload.sessionId);
            
            if (!session) {
                return null;
            }

            return {
                userId: session.userId,
                username: session.username,
                sessionId: session.sessionId
            };
        } catch (e) {
            return null;
        }
    }
}

export const authService = new AuthService();
