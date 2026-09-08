import net from 'node:net';

const token = process.argv[2] || '';
const host = '127.0.0.1';
const port = 10011;

const socket = net.createConnection({ host, port });

socket.on('connect', () => {
  console.log('CONNECTED');
});

socket.on('data', (data) => {
  const text = data.toString();
  process.stdout.write('DATA: ' + JSON.stringify(text) + '\n');

  if (text.includes('TS3')) {
    // Banner received - send commands
    send('use 1');
    setTimeout(() => send(`privilegekeyadd tokentext=${token}`), 300);
    setTimeout(() => send('apikeyadd scope=manage lifetime=0 clientuid=ServerQuery'), 800);
    setTimeout(() => send('quit'), 1300);
    setTimeout(() => socket.destroy(), 2000);
  }
});

function send(cmd) {
  process.stdout.write('SEND: ' + JSON.stringify(cmd + '\n') + '\n');
  socket.write(cmd + '\n');
}

socket.on('error', (err) => console.error('ERROR:', err.message));
socket.on('close', () => console.log('CLOSED'));

setTimeout(() => { console.log('TIMEOUT'); socket.destroy(); process.exit(0); }, 5000);