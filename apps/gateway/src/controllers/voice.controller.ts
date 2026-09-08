import { Request, Response, Router } from 'express';
import { voiceManager } from '../services/voice.manager.js';

const router = Router();
router.post('/connect', (req: Request, res: Response) => {
    const sessionId = (req as any).auth?.sessionId || 'ano';
    voiceManager.createSession(sessionId);
    res.json({ code: 'SUCCESS', message: 'Worker notificado.' });
});
export const voiceController = router;
