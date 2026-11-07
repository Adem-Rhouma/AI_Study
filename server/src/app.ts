import express, { type Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import type Database from 'better-sqlite3';
import { attachDatabase, attachUser } from './lib/auth-context.js';
import { ApiError, errorResponse } from './lib/http.js';
import { registerRoutes } from './routes.js';

export function createApp(db: Database.Database): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", ...(config.isProduction ? [] : ['ws:', 'http://localhost:5173'])],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProduction ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  if (!config.isProduction) {
    app.use(cors({ origin: config.webOrigin, credentials: true }));
  }

  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());
  app.use(attachDatabase(db));
  app.use(attachUser);

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '1h', index: false }));

  registerRoutes(app);

  // Serve the built SPA when it exists; the Vite dev server proxies /api in development.
  const indexHtml = path.join(config.webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.webDist, { index: false, maxAge: config.isProduction ? '7d' : 0 }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>AI Mastery</title><p style="font:16px system-ui;margin:2rem">API is running. Start the web client with <code>npm run dev</code> from the project root, or build it with <code>npm run build</code>.</p>'
        );
    });
  }

  app.use((_req, _res, next) => {
    next(ApiError.notFound(`No route for ${_req.method} ${_req.path}`));
  });

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const { status, body } = errorResponse(err);
    if (status >= 500) {
      console.error('[error]', req.method, req.path, err instanceof Error ? err.stack : err);
    }
    if (res.headersSent) return;
    res.status(status).json(body);
  });

  return app;
}
