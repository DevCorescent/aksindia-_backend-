// Minimal local SMTP server for the regression stack: accepts every message
// and appends it to MAIL_SINK_FILE as one JSON line { to, data }. Lets tests
// read the reset link / OTP from the email itself. Test use only, 127.0.0.1.
//   MAIL_SINK_PORT=2525 MAIL_SINK_FILE=/tmp/mails.jsonl node mail-sink.mjs
import { createServer } from 'node:net';
import { appendFileSync } from 'node:fs';

const port = Number(process.env.MAIL_SINK_PORT ?? 2525);
const file = process.env.MAIL_SINK_FILE;
if (!file) throw new Error('MAIL_SINK_FILE is required');

createServer((socket) => {
  let buffer = '';
  let inData = false;
  let to = [];
  let data = [];
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 mail-sink ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      if (inData) {
        if (line === '.') {
          appendFileSync(file, JSON.stringify({ to, data: data.join('\n') }) + '\n');
          inData = false; to = []; data = [];
          reply('250 queued');
        } else {
          data.push(line.startsWith('..') ? line.slice(1) : line);
        }
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') reply('250 mail-sink');
      else if (cmd === 'RCPT') { to.push(line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, '$1').toLowerCase()); reply('250 ok'); }
      else if (cmd === 'DATA') { inData = true; reply('354 end with .'); }
      else if (cmd === 'QUIT') { reply('221 bye'); socket.end(); }
      else reply('250 ok'); // MAIL, RSET, NOOP
    }
  });
  socket.on('error', () => undefined);
}).listen(port, '127.0.0.1', () => console.log(`mail-sink listening on ${port}`));
