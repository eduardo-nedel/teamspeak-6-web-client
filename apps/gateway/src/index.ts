import express from 'express';
import cors from 'cors';
import { info, error } from 'logger';
import { env } from './config.js';
import { authController } from './controllers/auth.controller.js';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

let isShuttingDown = false;
app.use((req, res, next) => {
    if (isShuttingDown) {
        res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'O servidor está desligando.', retryable: true });
        return;
    }
    next();
});

app.get('/health', (req, res) => { res.json({ status: 'ok', uptime: process.uptime() }); });
app.use('/api/auth', authController);

const server = app.listen(env.PORT, () => {
    info(`Gateway control plane listening on port ${env.PORT}`);
});

const GRACEFUL_SHUTDOWN_TIMEOUT = 15000;
function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    info(`${signal} recebido. Iniciando Graceful Shutdown...`);
    const timeout = setTimeout(() => {
        error(`Gateway timeout. Forçando encerramento.`);
        process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT);
    server.close(() => {
        clearTimeout(timeout);
        info('Gateway encerrado corretamente.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
