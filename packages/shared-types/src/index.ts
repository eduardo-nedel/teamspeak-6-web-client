import { z } from "zod";
export const PingSchema = z.object({ ping: z.string() });
