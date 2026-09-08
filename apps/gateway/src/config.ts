import { z } from 'zod';

const EnvSchema = z.object({
    PORT: z.string().default('4000'),
    JWT_SECRET: z.string().default('dummy_secret_for_development'),
    CORS_ORIGIN: z.string().default('*'),
});

const envParseResult = EnvSchema.safeParse(process.env);

if (!envParseResult.success) {
    console.error("Invalid environment variables:", envParseResult.error.format());
    process.exit(1);
}

export const env = envParseResult.data;
