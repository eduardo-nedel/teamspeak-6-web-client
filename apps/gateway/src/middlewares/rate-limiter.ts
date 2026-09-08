import { Request, Response, NextFunction } from 'express';

const buckets = new Map<string, { count: number; timer: NodeJS.Timeout }>();

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const limit = 30; // 30 req / 10s (Task 4.5)
    
    if (!buckets.has(ip)) {
        buckets.set(ip, { count: 1, timer: setTimeout(() => buckets.delete(ip), 10000) });
        return next();
    }
    
    const b = buckets.get(ip)!;
    if (b.count >= limit) {
        res.status(429).json({ code: 'RATE_LIMIT', message: 'Muitas requisicoes' });
        return;
    }
    b.count++;
    next();
};
