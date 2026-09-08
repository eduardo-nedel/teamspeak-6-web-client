import { z } from 'zod';

const EnvSchema = z.object({
    PORT: z.string().default('4000'),
    JWT_SECRET: z.string().default('dummy_secret_for_development'),
    CORS_ORIGIN: z.string().default('*'),
    // Conexão com o servidor TeamSpeak 6 real
    TS6_HOST: z.string().default('127.0.0.1'),
    TS6_VOICE_HOST: z.string().default('127.0.0.1'),
    TS6_VOICE_PORT: z.string().default('9987'),
    TS6_SERVER_PASSWORD: z.string().default(''),
    TS6_WEBQUERY_PORT: z.string().default('10080'),
    TS6_API_KEY: z.string().default(''),
    TS6_SERVER_ID: z.string().default('1'),
});

const envParseResult = EnvSchema.safeParse(process.env);

if (!envParseResult.success) {
    console.error("Invalid environment variables:", envParseResult.error.format());
    process.exit(1);
}

const parsed = envParseResult.data;

export const env = {
    ...parsed,
    PORT: parseInt(parsed.PORT, 10),
    TS6_VOICE_PORT: parseInt(parsed.TS6_VOICE_PORT, 10),
    TS6_WEBQUERY_PORT: parseInt(parsed.TS6_WEBQUERY_PORT, 10),
    TS6_SERVER_ID: parseInt(parsed.TS6_SERVER_ID, 10),
};
