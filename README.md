# AI Mastery

Comprehensive AI education platform — Express/SQLite API + React/Vite SPA (npm workspaces).

## Ports

| Service | Port | URL |
|---|---|---|
| Backend API | `4000` | http://192.168.1.15:4000/api/health |
| Frontend (Vite dev) | `5173` | http://192.168.1.15:5173 |

## Prerequisites

- Node.js `>=20.11`

```bash
node -v
npm -v
```

## Install (both)

```bash
npm install
```

## Database (first run only)

```bash
npm run db:migrate
npm run db:seed
```

## Run Development (Windows — PowerShell)

Open **two terminals** from the project root.

### Terminal 1 — Backend, port 4000

```powershell
$env:PORT="4000"
$env:WEB_ORIGIN="http://192.168.1.15:5173"
$env:NODE_ENV="development"
npm run dev:server
```

### Terminal 2 — Frontend, port 5173

```powershell
$env:WEB_PORT="5173"
$env:API_ORIGIN="http://localhost:4000"
npx vite --host 0.0.0.0 --port 5173
```

> `npm run dev:web` alone binds Vite to `localhost` only (`site can't be reached` from another device). Use `npx vite --host 0.0.0.0 --port 5173` for LAN.

Open http://192.168.1.15:5173

## Run Development (Linux)

Open **two terminals** from the project root.

### Terminal 1 — Backend, port 4000

```bash
cd /path/to/AI_Study
PORT=4000 WEB_ORIGIN=http://192.168.1.15:5173 NODE_ENV=development npm run dev:server
```

### Terminal 2 — Frontend, port 5173

```bash
cd /path/to/AI_Study
WEB_PORT=5173 API_ORIGIN=http://localhost:4000 npx vite --host 0.0.0.0 --port 5173
```

Open http://192.168.1.15:5173 (replace `192.168.1.15` with your machine's LAN IP)

## Production Build (single port, LAN)

### Windows — PowerShell

```powershell
npm run build
$env:PORT="4000"
$env:NODE_ENV="development"
npm run start
```

### Linux

```bash
npm run build
PORT=4000 NODE_ENV=development npm run start
# open http://192.168.1.15:4000  (API + built SPA, no Vite needed)
```

## Verify

```bash
curl http://192.168.1.15:4000/api/health
curl http://192.168.1.15:5173/
# {"ok":true,"service":"ai-mastery-api",...}
```

## Find Your LAN IP

### Windows — PowerShell

```powershell
ipconfig | Select-String IPv4
```

### Linux

```bash
hostname -I
```

## Stop

```bash
# Ctrl+C in each terminal
```

If port is busy:

### Windows — PowerShell

```powershell
netstat -ano | Select-String "4000|5173"
Stop-Process -Id <PID> -Force
```

### Linux

```bash
lsof -i :4000 -i :5173
kill <PID>
```
