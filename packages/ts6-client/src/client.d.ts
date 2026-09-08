import { EventEmitter } from "events";
import { IdentityData } from "./identity.js";
export declare const enum PacketType {
    Voice = 0,
    VoiceWhisper = 1,
    Command = 2,
    CommandLow = 3,
    Ping = 4,
    Pong = 5,
    Ack = 6,
    AckLow = 7,
    Init1 = 8
}
export interface Ts3ClientOptions {
    host: string;
    port: number;
    identity: IdentityData;
    nickname: string;
    serverPassword?: string;
    defaultChannel?: string;
    channelPassword?: string;
}
type ClientState = "disconnected" | "init" | "handshake" | "connected" | "disconnecting";
export declare class Ts3Client extends EventEmitter {
    private socket;
    private state;
    private opts;
    private packetCounter;
    private generationCounter;
    private inGenerationCounter;
    private resendMap;
    private initResend;
    private resendTimer;
    private pingTimer;
    private lastMessageTime;
    private cryptoInitComplete;
    private ivStruct;
    private fakeSignature;
    private keyNonceCache;
    private alphaTmp;
    private clientId;
    private fragmentBuffer;
    private fragmenting;
    private fragmentFlags;
    private channelMap;
    constructor();
    getState(): ClientState;
    getClientId(): number;
    connect(opts: Ts3ClientOptions): Promise<void>;
    /** Immediately close the socket without sending a disconnect command */
    forceClose(): void;
    disconnect(): void;
    private cleanup;
    sendVoice(opusData: Buffer): void;
    sendVoiceStop(): void;
    sendCommand(cmd: string): void;
    private buildInit0;
    private sendInitPacket;
    private sendOutgoing;
    private buildRawPacket;
    private encryptPacket;
    private decryptPacket;
    private tryDecrypt;
    private getKeyNonce;
    private getPacketCounter;
    private incPacketCounter;
    private sendRaw;
    private handleIncomingPacket;
    private sendAck;
    private handlePing;
    private handleAck;
    private handleInit;
    private handleCommandData;
    private processCommand;
    private handleInitIvExpand;
    private handleInitIvExpand2;
    private sendClientInit;
    private handleInitServer;
    private handleChannelList;
    private handleChannelListFinished;
    private resendLoop;
}
export {};
//# sourceMappingURL=client.d.ts.map