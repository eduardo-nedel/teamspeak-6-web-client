import http from 'node:http';
import { env } from '../config.js';

export interface TS6Channel {
  cid: number;
  pid: number;
  channel_name: string;
  channel_topic?: string;
  channel_codec?: number;
  total_clients?: number;
  channel_order?: number;
}

export interface TS6Client {
  clid: number;
  cid: number;
  client_nickname: string;
  client_type: number;
  client_is_talking?: boolean;
  client_input_muted?: boolean;
  client_output_muted?: boolean;
}

/**
 * Adaptador de Controle do TeamSpeak 6 via WebQuery HTTP.
 * Encapsula as chamadas à API do servidor TS6 (Control Plane).
 */
export class TS6Adapter {
  private host: string;
  private port: number;
  private apiKey: string;
  private serverId: number;

  constructor() {
    this.host = env.TS6_HOST;
    this.port = env.TS6_WEBQUERY_PORT;
    this.apiKey = env.TS6_API_KEY;
    this.serverId = env.TS6_SERVER_ID;
  }

  private request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queryParts = Object.entries(params).map(([k, v]) => {
        if (v === '' || v === undefined) return encodeURIComponent(k);
        return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
      });
      const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
      const path = `/${this.serverId}/${endpoint}${queryString}`;

      const req = http.request(
        {
          host: this.host,
          port: this.port,
          path,
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
            Accept: 'application/json',
          },
          timeout: 4000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                return reject(new Error(`TS6 WebQuery error (${res.statusCode}): ${data}`));
              }
              const parsed = JSON.parse(data);
              resolve((parsed.body || parsed.response || parsed) as T);
            } catch (e) {
              reject(e);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TS6 WebQuery timeout'));
      });

      req.on('error', (err) => reject(err));
      req.end();
    });
  }

  public async getChannels(): Promise<TS6Channel[]> {
    try {
      const result = await this.request<any>('channellist', { '-topic': '', '-flags': '' });
      let list: any[] = [];
      if (Array.isArray(result)) list = result;
      else if (result && Array.isArray(result.data)) list = result.data;
      else if (result && Array.isArray(result.body)) list = result.body;

      if (list.length > 0) {
        return list.map((c: any) => ({
          cid: parseInt(c.cid, 10),
          pid: parseInt(c.pid, 10),
          channel_name: c.channel_name,
          channel_topic: c.channel_topic || '',
          total_clients: parseInt(c.total_clients || '0', 10),
          channel_order: parseInt(c.channel_order || '0', 10),
        })) as TS6Channel[];
      }
      return [];
    } catch (err) {
      console.warn(`[TS6WebQuery] Falha ao consultar canais reais (${(err as Error).message}).`);
      return [];
    }
  }

  public async getClients(): Promise<TS6Client[]> {
    try {
      const result = await this.request<any>('clientlist', { '-voice': '', '-away': '' });
      let list: any[] = [];
      if (Array.isArray(result)) list = result;
      else if (result && Array.isArray(result.data)) list = result.data;
      else if (result && Array.isArray(result.body)) list = result.body;

      if (list.length > 0) {
        return list.map((u: any) => ({
          clid: parseInt(u.clid, 10),
          cid: parseInt(u.cid, 10),
          client_nickname: u.client_nickname,
          client_type: parseInt(u.client_type || '0', 10),
          client_is_talking: u.client_flag_talking === '1' || u.client_is_talking === '1' || u.client_is_talking === true,
          client_input_muted: u.client_input_muted === '1' || u.client_input_muted === true,
          client_output_muted: u.client_output_muted === '1' || u.client_output_muted === true,
        })) as TS6Client[];
      }
      return [];
    } catch (err) {
      console.warn(`[TS6WebQuery] Falha ao consultar clientes reais (${(err as Error).message}).`);
      return [];
    }
  }

  public async moveClient(clid: number, cid: number): Promise<boolean> {
    try {
      await this.request<any>('clientmove', { clid, cid });
      return true;
    } catch (err) {
      console.warn(`[TS6WebQuery] Não foi possível mover cliente no TS6 nativo: ${(err as Error).message}`);
      return false;
    }
  }

  public async kickClient(clid: number, reason: string = 'Kickado pelo Gateway'): Promise<boolean> {
    try {
      await this.request<any>('clientkick', { clid, reasonid: '4', reasonmsg: reason });
      return true;
    } catch (err) {
      console.warn(`[TS6WebQuery] Não foi possível kickar cliente no TS6 nativo: ${(err as Error).message}`);
      return false;
    }
  }
}

export const ts6Adapter = new TS6Adapter();
