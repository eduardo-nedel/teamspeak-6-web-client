import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';

export function authGuard(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            code: 'UNAUTHORIZED',
            message: 'Acesso negado: Token ausente.',
            retryable: false
        });
        return;
    }

    const token = authHeader.split(' ')[1];
    const ctx = authService.validateToken(token);
    
    if (!ctx) {
        res.status(401).json({
            code: 'UNAUTHORIZED_EXPIRED',
            message: 'Acesso negado: Sessão inválida ou expirada.',
            retryable: false
        });
        return;
    }

    // Pendura o contexto
    (req as any).auth = ctx;
    next();
}
