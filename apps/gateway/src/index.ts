import express from 'express';
import cors from 'cors';
import { info, error } from 'logger';
import { env } from './config.js';
import { authController } from './controllers/auth.controller.js';
import { authGuard } from './middlewares/auth.guard.js';
import { ts6Adapter } from './repositories/ts6.adapter.js';
import { setupVoiceProxy } from './voice-proxy.js';

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

// --- Rotas públicas ---
app.get('/health', (req, res) => { res.json({ status: 'ok', uptime: process.uptime() }); });
app.use('/api/auth', authController);

// --- Rotas protegidas (precisam JWT) ---
app.get('/api/channels', authGuard, async (req, res) => {
    try {
        const channels = await ts6Adapter.getChannels();
        const clients = await ts6Adapter.getClients();

        // Agrupa clientes por canal
        const channelMap: Record<number, { channel: any; clients: any[] }> = {};
        for (const ch of channels) {
            channelMap[ch.cid] = { channel: ch, clients: [] };
        }
        for (const cl of clients) {
            if (channelMap[cl.cid]) {
                channelMap[cl.cid].clients.push(cl);
            }
        }

        res.json({ code: 'SUCCESS', data: { channels, clients, channelMap } });
    } catch (err: any) {
        res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message || 'Erro ao buscar canais' });
    }
});

app.get('/api/server-info', authGuard, async (req, res) => {
    try {
        const channels = await ts6Adapter.getChannels();
        const clients = await ts6Adapter.getClients();
        res.json({
            code: 'SUCCESS',
            data: {
                serverName: 'TeamSpeak 6 Web Client',
                host: env.TS6_HOST,
                totalChannels: channels.length,
                totalClients: clients.length,
                uptime: process.uptime(),
            }
        });
    } catch (err: any) {
        res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message });
    }
});

const server = app.listen(env.PORT, () => {
    info(`Gateway control plane listening on port ${env.PORT}`);
    setupVoiceProxy(server);
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
