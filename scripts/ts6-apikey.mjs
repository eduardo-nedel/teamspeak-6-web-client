import { Client } from 'ssh2';
import { appendFileSync } from 'node:fs';
import fs from 'node:fs';

const conn = new Client();
const token = "mH3rLnzWoYDlHQQYRmg084S8wnEhmi2YdiYf5P3p";
const OUTPUT_FILE = ".env";

conn.on('ready', () => {
    console.log('SSH connected to TS6 Query');

    conn.shell((err, stream) => {
        if (err) throw err;

        let output = "";
        stream.on('close', () => {
            console.log('\nAPI Key Setup finished.');
            conn.end();
        });

        stream.on('data', (data) => {
            const str = data.toString();
            output += str;
            process.stdout.write(str);

            // Auto answer yes if asked for confirmations
            if (output.includes('[Y/n]') || output.includes('Confirm')) {
                stream.write('y\n');
            }

            // Check if we successfully got the API Key
            const match = str.match(/apikey=([A-Za-z0-9+/=]+)/);
            if (match) {
                const apiKey = match[1];
                console.log(`\n\nSUCCESS! API Key Found: ${apiKey}`);
                
                // Write to .env
                const env = `TS6_API_KEY=${apiKey}\n`;
                appendFileSync(OUTPUT_FILE, env);
                
                // Cleanup
                stream.write('quit\n');
            }
        });

        // 1. Use server 1
        stream.write('use 1\n');
        
        // 2. Add privilege key (token)
        stream.write(`privilegekeyadd tokentext=${token}\n`);
        
        // 3. Create API key
        setTimeout(() => {
            stream.write('apikeyadd scope=manage lifetime=0 clientuid=LocalTest\n');
        }, 500);
        
        // Timeout to ensure we exit if something hangs
        setTimeout(() => {
            stream.write('quit\n');
            setTimeout(() => process.exit(0), 500);
        }, 3000);
    });
}).connect({
    host: '127.0.0.1',
    port: 10022,
    username: 'serveradmin',
    password: 'admin123',
    readyTimeout: 5000
});
