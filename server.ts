import "dotenv/config";
import express from "express";
import path from "path";
import { createApp } from "./server-app";

async function startServer() {
  const app = await createApp();

  let selectedPort = 3000;
  if (process.env.PORT) {
    selectedPort = parseInt(process.env.PORT, 10);
  } else {
    const portArgIndex = process.argv.indexOf('--port');
    if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
      selectedPort = parseInt(process.argv[portArgIndex + 1], 10);
    }
  }
  const PORT = selectedPort || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
