// ─────────────────────────────────────────────────────────
// server.ts – Ponto de entrada do servidor (Day 1)
// ─────────────────────────────────────────────────────────

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerSocket } from "./socket";

const PORT = Number(process.env.PORT ?? 4000);

async function bootstrap(): Promise<void> {
  // 1. App Express
  const app = express();

  // 2. Servidor HTTP
  const httpServer = createServer(app);

  // 3. Socket.io com CORS liberado para desenvolvimento
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // 4. Rota de status simples
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      game: "Ligarium",
      version: "0.1.0 – Day 1",
      uptime: process.uptime(),
    });
  });

  // 5. Registrar eventos de socket
  registerSocket(io);

  // 6. Subir servidor
  httpServer.listen(PORT, () => {
    console.log(`🚀 Ligarium server rodando em http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});
