import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

import dotenv from 'dotenv';
dotenv.config({ path: envPath });

import './apps/gateway/dist/index.js';
