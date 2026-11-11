// @ts-check
// ws-gate: lets the extension reach this program over a local WebSocket, so nothing has to be registered with Chrome.
// It does the job the old native host did: it moves whole frames between the extension and the bridge's local socket and reads none of them.
//
// Only 127.0.0.1 is listened on. A connection is accepted only when Chrome says it comes from this package's own extension
// (the Origin header Chrome sets for an extension, chrome-extension://<fixed id>), and the gate then announces that origin to
// the bridge, which already refuses any other. Web pages cannot open it: a page's Origin is its own site, never an extension.

import net from "node:net";
import http from "node:http";
import crypto from "node:crypto";
import { encode, MAX } from "../native-host/stdio.js";

export const WS_PORT = Number(process.env.VYRE_CHROME_PORT || 47213);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Splits the bridge's byte stream into whole frames (4-byte little-endian length, then JSON). */
function framer() {
  let buf = Buffer.alloc(0);
  return {
    /** @param {Buffer} chunk @returns {string[]} */
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      /** @type {string[]} */ const out = [];
      for (;;) {
        if (buf.length < 4) break;
        const len = buf.readUInt32LE(0);
        if (len > MAX) throw new Error(`message too large: ${len} bytes`);
        if (buf.length < 4 + len) break;
        out.push(buf.subarray(4, 4 + len).toString("utf8"));
        buf = buf.subarray(4 + len);
      }
      return out;
    },
  };
}

/** One WebSocket text frame from the server (never masked). @param {string} text */
function wsFrame(text) {
  const body = Buffer.from(text, "utf8");
  const n = body.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, body]);
}

/** Reads client frames (always masked), joins fragments, answers pings. */
function wsReader(/** @type {(t: string) => void} */ onText, /** @type {() => void} */ onClose, /** @type {(b: Buffer) => void} */ write) {
  let buf = Buffer.alloc(0);
  /** @type {Buffer[]} */ let parts = [];
  return (/** @type {Buffer} */ chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(MAX)) { onClose(); return; } len = Number(big); off = 10; }
      if (!masked) { onClose(); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 0x8) { onClose(); return; }
      if (op === 0x9) { write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        parts.push(data);
        if (fin) { const t = Buffer.concat(parts).toString("utf8"); parts = []; onText(t); }
      }
    }
  };
}

/**
 * Start the gate. Resolves with { port, close } once listening, or with null when the port is taken
 * (another Claude Code or Codex session already serves this browser; this one says so in its status).
 * @param {{ sockPath: string, extensionId: string, log?: (m: string) => void, port?: number }} o
 */
export function startGate({ sockPath, extensionId, log = () => {}, port = WS_PORT }) {
  const allowed = `chrome-extension://${extensionId}`;
  const server = http.createServer((_req, res) => { res.writeHead(426, { "content-type": "text/plain" }); res.end("Vyre for Chrome: this address is for the extension only.\n"); });
  server.on("upgrade", (req, socket) => {
    const origin = String(req.headers.origin || "");
    const key = String(req.headers["sec-websocket-key"] || "");
    if (origin !== allowed || !key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") {
      log(`refused a connection from ${origin || "no origin"}`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const mod = net.connect(sockPath);
    /** @type {string[]} */ let early = [];
    let up = false, done = false;
    const finish = () => { if (done) return; done = true; try { socket.destroy(); } catch { /* gone */ } try { mod.destroy(); } catch { /* gone */ } };
    const fromModule = framer();
    mod.once("connect", () => {
      up = true;
      mod.write(encode({ event: "host", origin: `${allowed}/`, ppid: process.pid }));
      for (const t of early) { try { mod.write(encode(JSON.parse(t))); } catch { /* not JSON: dropped */ } }
      early = [];
    });
    mod.on("data", d => { try { for (const t of fromModule.push(/** @type {Buffer} */ (d))) socket.write(wsFrame(t)); } catch { finish(); } });
    mod.on("error", () => { try { socket.write(wsFrame(JSON.stringify({ event: "no_module" }))); } catch { /* gone */ } finish(); });
    mod.on("close", finish);
    socket.on("data", wsReader(t => {
      if (t.includes('"keepalive"')) { try { if (JSON.parse(t).event === "keepalive") return; } catch { /* not ours */ } }
      if (!up) { early.push(t); return; }
      try { mod.write(encode(JSON.parse(t))); } catch { /* not JSON: dropped */ }
    }, finish, b => { try { socket.write(b); } catch { finish(); } }));
    socket.on("error", finish);
    socket.on("close", finish);
  });
  return new Promise(resolve => {
    server.once("error", (/** @type {any} */ e) => { log(e && e.code === "EADDRINUSE" ? `port ${port} is taken: another Claude Code or Codex session already drives this browser` : `could not listen: ${e && e.message}`); resolve(null); });
    server.listen(port, "127.0.0.1", () => resolve({ port, close: () => new Promise(r => server.close(() => r(null))) }));
  });
}
