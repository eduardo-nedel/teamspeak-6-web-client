export interface Session {
    sessionId: string;
    userId: string;
    username: string;
    createdAt: number;
    expiresAt: number;
}

export interface AuthContext {
    userId: string;
    username: string;
    sessionId: string;
}
