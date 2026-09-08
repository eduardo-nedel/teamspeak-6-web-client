import { WebSocketServer, WebSocket } from 'ws';
import { info } from 'logger';

export class WebRTCHub {
    private wss: WebSocketServer | null = null;
    public init(server: any) {
        this.wss = new WebSocketServer({ server, path: '/webrtc' });
        this.wss.on('connection', (ws: WebSocket) => {
            info('WebRTC Signaling connection open');
            ws.on('message', (msg) => {
                // Renegotiation logics
            });
        });
    }
}
export const webrtcHub = new WebRTCHub();
