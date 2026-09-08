export interface TS6Error {
    code: string;
    message: string;
    retryable: boolean;
}
export function mapTS6Error(raw: any): TS6Error {
    return {
        code: raw?.id || 'UNKNOWN_ERROR',
        message: raw?.msg || 'Erro inesperado.',
        retryable: false
    };
}
