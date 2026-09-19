import net from 'node:net';
import { resolveSrv } from 'node:dns/promises';

function vint(value) {
  const out = [];
  do {
    let byte = value & 127;
    value >>>= 7;
    if (value) byte |= 128;
    out.push(byte);
  } while (value);
  return Buffer.from(out);
}

function readVar(buffer, start = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (start + i >= buffer.length) return null;
    const byte = buffer[start + i];
    value |= (byte & 127) << (7 * i);
    if (!(byte & 128)) return { value: value >>> 0, next: start + i + 1 };
  }
  throw new Error('Paquete de estado inválido.');
}

function string(value) {
  const buffer = Buffer.from(value);
  return Buffer.concat([vint(buffer.length), buffer]);
}

function packet(buffer) {
  return Buffer.concat([vint(buffer.length), buffer]);
}

export function plainDescription(value) {
  if (typeof value === 'string') return value.replace(/§./g, '').replace(/\s+/g, ' ').trim();
  if (!value || typeof value !== 'object') return '';
  const parts = [];
  if (typeof value.text === 'string') parts.push(value.text);
  if (Array.isArray(value.extra)) parts.push(...value.extra.map(plainDescription));
  if (typeof value.translate === 'string' && !parts.length) parts.push(value.translate);
  return parts.join('').replace(/§./g, '').replace(/\s+/g, ' ').trim();
}

export async function serverStatus(address) {
  const [host, givenPort] = address.split(':');
  let port = Number(givenPort || 25565);
  let target = host;
  if (!givenPort) {
    try {
      const rows = await resolveSrv(`_minecraft._tcp.${host}`);
      rows.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      if (rows[0]) {
        target = rows[0].name;
        port = rows[0].port;
      }
    } catch {
      // Un SRV no es obligatorio.
    }
  }

  return new Promise(resolve => {
    let buffer = Buffer.alloc(0);
    let done = false;
    const started = Date.now();
    const socket = net.createConnection({ host: target, port });
    const timer = setTimeout(() => finish({ online: false }), 5000);

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    }

    socket.on('error', () => finish({ online: false }));
    socket.on('connect', () => {
      const portBuffer = Buffer.alloc(2);
      portBuffer.writeUInt16BE(port);
      socket.write(packet(Buffer.concat([vint(0), vint(0), string(host), portBuffer, vint(1)])));
      socket.write(packet(vint(0)));
    });
    socket.on('data', chunk => {
      try {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > 1024 * 1024) throw new Error('Tamaño inválido');
        const length = readVar(buffer);
        if (!length) return;
        if (length.value > 1024 * 1024) throw new Error('Tamaño inválido');
        if (buffer.length < length.next + length.value) return;
        const id = readVar(buffer, length.next);
        if (!id || id.value !== 0) throw new Error('Respuesta inválida');
        const textLength = readVar(buffer, id.next);
        if (!textLength || textLength.next + textLength.value > buffer.length) throw new Error('Respuesta inválida');
        const data = JSON.parse(buffer.subarray(textLength.next, textLength.next + textLength.value).toString());
        finish({
          online: true,
          players: Number(data.players?.online) || 0,
          maxPlayers: Number(data.players?.max) || 0,
          pingMs: Math.max(1, Date.now() - started),
          version: String(data.version?.name || '').slice(0, 80),
          protocol: Number(data.version?.protocol) || 0,
          motd: plainDescription(data.description).slice(0, 180)
        });
      } catch {
        finish({ online: false });
      }
    });
  });
}
