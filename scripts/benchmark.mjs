import autocannon from 'autocannon';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayPath = path.resolve(__dirname, '../apps/gateway/dist/index.js');

console.log("Iniciando o servidor em background para benchmark...");
const gatewayProcess = spawn('node', [gatewayPath], {
  env: { ...process.env, PORT: '4005' } // isolated port
});

let isRunning = false;
gatewayProcess.stdout.on('data', (data) => {
    if (data.toString().includes('listening on port') && !isRunning) {
        isRunning = true;
        console.log("Servidor pronto! Rodando benchmarks...");
        runBenchmark();
    }
});

function runBenchmark() {
    const instance = autocannon({
        url: 'http://localhost:4005/health',
        connections: 100,
        pipelining: 10,
        duration: 10
    }, (err, result) => {
        if (err) {
            console.error("Erro no benchmark", err);
        } else {
            console.log("==== RESULTADOS DO BENCHMARK ====");
            console.log(`Requisições: ${result.requests.total} em 10s`);
            console.log(`Média Req/s: ${result.requests.average}`);
            console.log(`Latência Média: ${result.latency.average} ms`);
            console.log(`Erros/Timeouts: ${result.errors} / ${result.timeouts}`);
            console.log("=================================");
        }
        
        console.log("Encerrando o servidor...");
        gatewayProcess.kill('SIGTERM');
        process.exit(0);
    });

    autocannon.track(instance, { renderProgressBar: true });
}

setTimeout(() => {
    if (!isRunning) {
        console.error("Servidor não iniciou a tempo.");
        gatewayProcess.kill();
        process.exit(1);
    }
}, 5000);
