import { Request, Response, Router } from 'express';
import { LoginRequestSchema } from '../dto/auth.dto.js';
import { authService } from '../services/auth.service.js';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            code: 'BAD_REQUEST',
            message: 'Requisição inválida',
            retryable: false,
            details: parsed.error.format()
        });
        return;
    }

    const result = authService.login(parsed.data);
    if ('error' in result) {
        res.status(401).json(result.error);
        return;
    }

    res.status(200).json({
        code: 'SUCCESS',
        data: result
    });
});

router.post('/logout', (req: Request, res: Response): void => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const ctx = authService.validateToken(token);
        if (ctx) {
            authService.logout(ctx.sessionId);
        }
    }
    
    // Sucesso independente do token (idempotente)
    res.status(200).json({
        code: 'SUCCESS',
        message: 'Logout realizado com sucesso'
    });
});

router.get('/me', (req: Request, res: Response): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
         res.status(401).json({
            code: 'UNAUTHORIZED',
            message: 'Acesso negado',
            retryable: false
        });
        return;
    }

    const token = authHeader.split(' ')[1];
    const ctx = authService.validateToken(token);
    
    if (!ctx) {
         res.status(401).json({
            code: 'UNAUTHORIZED_EXPIRED',
            message: 'Sessão inválida ou expirada',
            retryable: false
        });
        return;
    }

    res.status(200).json({
        code: 'SUCCESS',
        data: ctx
    });
});

export const authController = router;
