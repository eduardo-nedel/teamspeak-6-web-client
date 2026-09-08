import { Request, Response, Router } from 'express';

const router = Router();
router.post('/message', (req: Request, res: Response) => {
    // [~] IMPEDIMENTO: WebQuery FFI needed to broadcast this
    res.json({ code: 'SUCCESS', message: 'Chat mock sent' });
});
export const chatController = router;
