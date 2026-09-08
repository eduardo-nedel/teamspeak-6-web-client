import { Request, Response, NextFunction } from 'express';

const idempotencyStore = new Map<string, number>();

export function idempotency(req: Request, res: Response, next: NextFunction): void {
    const reqId = req.headers['x-request-id'] as string;
    if (!reqId) return next();
    
    const now = Date.now();
    if (idempotencyStore.has(reqId)) {
        res.status(409).json({ code: 'DUPLICATE', message: 'Requisicao duplicada' });
        return;
    }
    idempotencyStore.set(reqId, now);
    next();
}
