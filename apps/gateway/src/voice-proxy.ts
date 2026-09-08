import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { Ts3Client, generateIdentity, IdentityData } from 'ts6-client';
import jwt from 'jsonwebtoken';
import { env } from './config.js';

interface VoiceSession {
  ws: WebSocket;
  client: Ts3Client;
  identity: IdentityData;
  channelId?: string;
  nickname: string;
  isMuted: boolean;
  isConnected: boolean;
}

const sessions = new Map<string, VoiceSession>();

export function setupVoiceProxy(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/voice' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate via query param
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as any;
    } catch {
      ws.close(4002, 'Invalid token');
      return;
    }

    const sessionId = payload.sub + '-' + Date.now();
    const nickname = payload.username || 'WebUser';
    
    console.log(`[Voice] ${nickname} connecting to voice...`);

    // Create TS6 client
    const client = new Ts3Client();
    const identity = generateIdentity(8);
    
    const session: VoiceSession = {
      ws,
      client,
      identity,
      nickname,
      isMuted: false,
      isConnected: false,
    };

    sessions.set(sessionId, session);

    // Handle messages from browser
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        
        switch (msg.type) {
          case 'join':
            handleJoin(sessionId, msg.channelId || '4', msg.nickname || nickname);
            break;
          case 'mute':
            session.isMuted = true;
            session.client.sendVoiceStop();
            ws.send(JSON.stringify({ type: 'muted' }));
            break;
          case 'unmute':
            session.isMuted = false;
            ws.send(JSON.stringify({ type: 'unmuted' }));
            break;
          case 'leave':
            handleLeave(sessionId);
            break;
          case 'audio':
            // PCM audio from browser (encoded as base64)
            if (!session.isMuted && session.isConnected) {
              handleAudioFromBrowser(session, Buffer.from(msg.data, 'base64'));
            }
            break;
        }
      } catch (err: any) {
        console.error(`[Voice] Error processing message:`, err.message);
      }
    });

    ws.on('close', () => {
      console.log(`[Voice] ${nickname} disconnected`);
      handleLeave(sessionId);
    });

    ws.on('error', (err) => {
      console.error(`[Voice] WebSocket error for ${nickname}:`, err.message);
    });

    // Send ready signal
    ws.send(JSON.stringify({ type: 'ready', nickname }));
  });

  console.log('[Voice] WebSocket voice proxy ready on /ws/voice');
}

async function handleJoin(sessionId: string, channelId: string, nickname: string) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const { client, identity, ws } = session;

  // Listen for voice data from TS6
  client.on('voice', (voiceData: Buffer) => {
    if (voiceData.length > 5 && ws.readyState === WebSocket.OPEN) {
      // Extract the opus data after the S2C header (skip 5 bytes)
      const opusData = voiceData.subarray(5);
      ws.send(JSON.stringify({
        type: 'voice',
        data: opusData.toString('base64'),
        fromClid: voiceData.readUInt16BE(2),
      }));
    }
  });

  client.on('error', (err: any) => {
    console.error(`[Voice] TS6 client error:`, err.message);
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  });

  client.on('disconnected', (reason: any) => {
    console.log(`[Voice] TS6 disconnected:`, reason);
    session.isConnected = false;
    ws.send(JSON.stringify({ type: 'disconnected', reason: String(reason) }));
  });

  try {
    await client.connect({
      host: env.TS6_HOST,
      port: env.TS6_VOICE_PORT,
      serverPassword: env.TS6_SERVER_PASSWORD || undefined,
      nickname,
      identity,
      defaultChannel: channelId,
    });

    session.isConnected = true;
    session.channelId = channelId;
    
    ws.send(JSON.stringify({ 
      type: 'joined', 
      channelId,
      nickname,
      clientId: client.getClientId(),
    }));
    
    console.log(`[Voice] ${nickname} joined channel ${channelId}`);
  } catch (err: any) {
    console.error(`[Voice] Failed to connect:`, err.message);
    ws.send(JSON.stringify({ type: 'error', message: `Failed to connect: ${err.message}` }));
  }
}

function handleAudioFromBrowser(session: VoiceSession, pcmBuffer: Buffer) {
  if (!session.isConnected || session.isMuted) return;
  
  try {
    // The browser sends raw PCM s16le stereo 48kHz
    // ts6-client needs opus-encoded data
    // For now, send raw PCM and let the ts6-client handle encoding
    // This is a simplified path - in production we'd encode with opus encoder
    session.client.sendVoice(pcmBuffer);
  } catch (err: any) {
    console.error(`[Voice] Error sending audio:`, err.message);
  }
}

function handleLeave(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  try {
    session.client.disconnect();
  } catch {}
  
  session.isConnected = false;
  sessions.delete(sessionId);
}
