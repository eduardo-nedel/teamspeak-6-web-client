import { z } from 'zod';

export const LoginRequestSchema = z.object({
    username: z.string().min(3).max(32),
    password: z.string().min(1), // Em um mock, a senha genérica serve
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
