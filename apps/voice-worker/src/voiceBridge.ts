import { Ts3Client } from 'ts6-client';
import { generateIdentity } from 'ts6-client';
import { buildCommand } from 'ts6-client';
import OpusScript from 'opusscript';

export interface VoiceUser {
  id: string;
  correlationId: string;
  nickname: string;
  channelId: number;
  isMuted: boolean;
  isDeafened: boolean;
  isTalking: boolean;
  tsClient?: Ts3Client;
  tsClientId?: number;
  opusDecoder: any;
  opusEncoder: any;
  pcmAccumulator: Buffer;
  stats: {
    micPacketsReceived: number;
    micBytesReceived: number;
    opusFramesSent: number;
    opusBytesSent: number;
    ts6VoicePacketsReceived: number;
    lastMicLogAt: number;
    lastTs6VoiceLogAt: number;
  };
}

export class VoiceBridge {
  private users: Map<string, VoiceUser> = new Map();

  constructor(
    private voiceHost: string,
    private voicePort: number,
    private serverPassword: string,
    private onEvent: (userId: string, event: any) => void = () => {},
  ) {}

  public registerUser(id: string, correlationId: string, nickname: string, channelId: number): VoiceUser {
    const opusDecoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
    const opusEncoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);

    const user: VoiceUser = {
      id,
      correlationId,
      nickname,
      channelId,
      isMuted: false,
      isDeafened: false,
      isTalking: false,
      opusDecoder,
      opusEncoder,
      pcmAccumulator: Buffer.alloc(0),
      stats: {
        micPacketsReceived: 0,
        micBytesReceived: 0,
        opusFramesSent: 0,
        opusBytesSent: 0,
        ts6VoicePacketsReceived: 0,
        lastMicLogAt: 0,
        lastTs6VoiceLogAt: 0,
      },
    };

    console.log(`[${new Date().toISOString()}] [${correlationId}] [AUDIO-BRIDGE] 🚀 Registrando usuário: ${nickname} (UID: ${id}) no canal ${channelId}`);

    try {
      const tsClient = new Ts3Client();
      user.tsClient = tsClient;
      const identity = generateIdentity(8);

      tsClient.on('connected', () => {
        user.tsClientId = tsClient.getClientId();
        console.log(`[${new Date().toISOString()}] [${correlationId}] [TS6-NATIVE] ✅ Ts3Client conectado no TS6! Nick: ${nickname}, Clid: ${user.tsClientId}, Canal: ${channelId}`);
        this.onEvent(id, { type: 'ts6_connected', clid: user.tsClientId, channelId });
      });

      tsClient.on('voice', (voiceData: Buffer) => {
        user.stats.ts6VoicePacketsReceived++;
        const now = Date.now();
        if (now - user.stats.lastTs6VoiceLogAt > 2000) {
          user.stats.lastTs6VoiceLogAt = now;
          console.log(`[${new Date().toISOString()}] [${correlationId}] [TS6->WEB] 🔊 Recebendo voz do TS6! Total pacotes: ${user.stats.ts6VoicePacketsReceived}, tamanho frame atual: ${voiceData.length}B`);
        }
        // Jitter/jitter buffer acontece do lado do cliente.
        // Aqui apenas reportamos o evento de voz recebida (PCM decodificado)
        if (voiceData.length <= 5) return;
        try {
          const opusPayload = voiceData.subarray(5);
          if (opusPayload.length === 0) return;
          const pcm: Buffer = user.opusDecoder.decode(opusPayload);
          if (pcm && pcm.length > 0) {
            this.onEvent('ts6_to_web', {
              type: 'pcm_frame',
              userId: id,
              pcmLength: pcm.length,
              receivedAt: Date.now(),
            });
          }
        } catch { /* erro de decode não derruba o bridge */ }
      });

      tsClient.on('error', (err: any) => {
        console.error(`[${new Date().toISOString()}] [${correlationId}] [TS6-NATIVE] ⚠️ Erro no Ts3Client (${nickname}):`, err.message || err);
      });

      tsClient.on('disconnected', (reason: any) => {
        console.log(`[${new Date().toISOString()}] [${correlationId}] [TS6-NATIVE] 🔌 Ts3Client desconectado (${nickname}):`, reason);
      });

      tsClient.connect({
        host: this.voiceHost,
        port: this.voicePort,
        serverPassword: this.serverPassword,
        nickname,
        identity,
        defaultChannel: String(channelId),
      }).catch((err: any) => {
        console.error(`[${new Date().toISOString()}] [${correlationId}] [TS6-NATIVE] ❌ Falha ao conectar Ts3Client (${nickname}):`, err.message);
      });
    } catch (e: any) {
      console.error(`[${new Date().toISOString()}] [${correlationId}] [AUDIO-BRIDGE] ❌ Falha ao instanciar Ts3Client:`, e.message);
    }

    this.users.set(id, user);
    return user;
  }

  public removeUser(id: string): void {
    const user = this.users.get(id);
    if (user) {
      console.log(`[${new Date().toISOString()}] [${user.correlationId}] [AUDIO-BRIDGE] 🚪 Desconectando usuário ${user.nickname}. Total áudio enviado: ${user.stats.opusBytesSent}B (${user.stats.opusFramesSent} frames), total áudio recebido: ${user.stats.ts6VoicePacketsReceived} pacotes`);
      if (user.tsClient) {
        try { user.tsClient.disconnect(); } catch { /* ignore */ }
      }
      this.users.delete(id);
    }
  }

  public moveUser(id: string, newChannelId: number): boolean {
    const user = this.users.get(id);
    if (!user) return false;

    const oldChannelId = user.channelId;
    user.channelId = newChannelId;
    user.isTalking = false;

    console.log(`[${new Date().toISOString()}] [${user.correlationId}] [AUDIO-BRIDGE] 🔄 Movendo ${user.nickname}: canal ${oldChannelId} -> ${newChannelId}`);

    if (user.tsClient && user.tsClientId) {
      try {
        user.tsClient.sendCommand(buildCommand('clientmove', {
          cid: String(newChannelId),
          clid: String(user.tsClientId),
        }));
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] [${user.correlationId}] [TS6-NATIVE] ❌ Falha no clientmove:`, err.message);
      }
    }
    return true;
  }

  public broadcastAudio(senderId: string, audioChunk: Buffer): void {
    const sender = this.users.get(senderId);
    if (!sender || sender.isMuted) return;

    sender.stats.micPacketsReceived++;
    sender.stats.micBytesReceived += audioChunk.length;

    if (sender.tsClient && sender.opusEncoder) {
      try {
        sender.pcmAccumulator = Buffer.concat([sender.pcmAccumulator, audioChunk]);

        // Processa blocos de 960 amostras (1920 bytes mono -> 3840 bytes estéreo)
        while (sender.pcmAccumulator.length >= 1920) {
          const monoFrame = sender.pcmAccumulator.subarray(0, 1920);
          sender.pcmAccumulator = sender.pcmAccumulator.subarray(1920);

          const stereoPcm = Buffer.alloc(3840);
          for (let i = 0; i < 960; i++) {
            const sample = monoFrame.readInt16LE(i * 2);
            stereoPcm.writeInt16LE(sample, i * 4);     // Left
            stereoPcm.writeInt16LE(sample, i * 4 + 2); // Right
          }

          try {
            const encoded = sender.opusEncoder.encode(stereoPcm, 960);
            if (encoded && encoded.length > 0) {
              sender.tsClient.sendVoice(Buffer.from(encoded));
              sender.stats.opusFramesSent++;
              sender.stats.opusBytesSent += encoded.length;
            }
          } catch (encErr: any) {
            // Se o encoder Wasm corromper, recria a instância
            sender.opusEncoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
          }
        }

        const now = Date.now();
        if (now - sender.stats.lastMicLogAt > 1500) {
          sender.stats.lastMicLogAt = now;
          console.log(`[${new Date().toISOString()}] [${sender.correlationId}] [WEB->TS6] 🎙️ Microfone transmitido! Chunks recebidos: ${sender.stats.micPacketsReceived} (${sender.stats.micBytesReceived}B), Frames Opus enviados ao TS6: ${sender.stats.opusFramesSent} (${sender.stats.opusBytesSent}B)`);
        }
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] [${sender.correlationId}] [OPUS-ENC] ❌ Erro ao codificar voz:`, err.message);
      }
    }
  }

  public setMuteState(id: string, isMuted: boolean, isDeafened: boolean): void {
    const user = this.users.get(id);
    if (user) {
      user.isMuted = isMuted;
      user.isDeafened = isDeafened;
      if (isMuted) {
        user.isTalking = false;
        if (user.tsClient) user.tsClient.sendVoiceStop();
      }
    }
  }

  public setTalkingState(id: string, isTalking: boolean): void {
    const user = this.users.get(id);
    if (user && !user.isMuted) {
      user.isTalking = isTalking;
      if (!isTalking && user.tsClient) {
        user.tsClient.sendVoiceStop();
      }
    }
  }

  public getUser(id: string) {
    return this.users.get(id);
  }

  public getAllUsers() {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id,
      nickname: u.nickname,
      channelId: u.channelId,
      isMuted: u.isMuted,
      isDeafened: u.isDeafened,
      isTalking: u.isTalking,
    }));
  }
}