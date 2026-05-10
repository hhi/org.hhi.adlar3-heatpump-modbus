/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-unresolved */
/* eslint-disable node/no-missing-import */
/* eslint-disable import/extensions */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { DataSnapshot } from '../modbus/adlar3-modbus-service';
import {
  ALL_HOLDING_REGISTERS,
  ALL_INPUT_REGISTERS,
  CONTROL_REGISTERS,
  SENSOR_REGISTERS,
  STATUS_BITS,
} from '../modbus/adlar3-modbus-registers';

type TemperatureRegisterScale = 'x1' | 'x10';

// ── Whitelist voor ADR-044 interactief dashboard ───────────────────────────────

interface WritableRegisterMeta {
  address: number;
  min: number;
  max: number;
  multiply: number;
  name: string;
}

const WRITABLE_REGISTERS: Record<string, WritableRegisterMeta> = {
  zone1HeatingSetTemp: { address: CONTROL_REGISTERS.zone1HeatingSetTemp.address, min: 18, max: 50, multiply: 0.1, name: 'Zone 1 verwarming setpoint' },
  zone1CoolingSetTemp: { address: CONTROL_REGISTERS.zone1CoolingSetTemp.address, min: 7,  max: 25, multiply: 0.1, name: 'Zone 1 koeling setpoint' },
  dhwSetTemp:          { address: CONTROL_REGISTERS.dhwSetTemp.address,          min: 20, max: 75, multiply: 0.1, name: 'Tapwater setpoint' },
  roomTempSetTemp:     { address: CONTROL_REGISTERS.roomTempSetTemp.address,     min: 15, max: 30, multiply: 0.1, name: 'Ruimtetemperatuur setpoint' },
};

// ── Registermetadata types voor ADR-046 expertdashboard ───────────────────────

interface RegisterMeta {
  key: string;
  registerId?: string;
  address: number;
  name: string;
  unit?: string;
  multiply?: number;
  scaleMultiply?: number;
  isTemperatureRegister?: boolean;
  min?: number;
  max?: number;
  default?: number;
  desc?: string;
  isCoil?: boolean;
  fc?: 'input' | 'holding';
  serviceOnly?: boolean;
  readOnly?: boolean;
  bits?: Record<string, number>;
  pollGroups?: string[];
}

interface RegisterBlock {
  id: string;
  label: string;
  readOnly: boolean;
  registers: RegisterMeta[];
}

// ── DashboardService opties ────────────────────────────────────────────────────

export interface DashboardServiceOptions {
  /** __dirname van app.ts — basis voor het pad naar public/ */
  appDir: string;
  logger: (msg: string, ...args: unknown[]) => void;
  /** default 8090 */
  port?: number;
}

/**
 * ADR-041a / ADR-044 / ADR-046: Lokale HTTP-server die drie dashboards serveert.
 *
 * Routes:
 *   GET /                      → public/dashboard.html          (read-only)
 *   GET /dashboard.html        → public/dashboard.html
 *   GET /api/snapshot          → laatste DataSnapshot als JSON
 *   GET /interactive           → public/dashboard-interactive.html (ADR-044)
 *   GET /interactive.html      → zelfde
 *   POST /api/write            → schrijf één whitelisted register (ADR-044)
 *   GET /expert                → public/dashboard-expert.html   (ADR-046)
 *   GET /expert.html           → zelfde
 *   GET /api/registers         → alle registerblokken als JSON  (ADR-046)
 *   POST /api/expert/read      → lees één register live        (ADR-046)
 *   POST /api/expert/write     → schrijf één register/coil     (ADR-046)
 *   *                          → 404
 */
export class DashboardService {
  private snapshot: DataSnapshot | null = null;
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly publicDir: string;
  private readonly logger: (msg: string, ...args: unknown[]) => void;

  // Callbacks — worden laat gebonden vanuit device.ts
  private onWriteRegister: ((address: number, rawValue: number) => Promise<void>) | null = null;
  private onReadRegister: ((address: number, isCoil: boolean, isInput: boolean) => Promise<number>) | null = null;
  private onWriteExpert: ((address: number, rawValue: number, isCoil: boolean) => Promise<void>) | null = null;
  private getTemperatureScale: (() => TemperatureRegisterScale) | null = null;

  constructor(options: DashboardServiceOptions) {
    this.port = options.port ?? 8090;
    this.publicDir = path.join(options.appDir, 'public');
    this.logger = options.logger;
  }

  // ── Publieke setters voor laat binden van callbacks ──────────────────────────

  setWriteRegisterCallback(fn: (address: number, rawValue: number) => Promise<void>): void {
    this.onWriteRegister = fn;
  }

  setReadRegisterCallback(fn: (address: number, isCoil: boolean, isInput: boolean) => Promise<number>): void {
    this.onReadRegister = fn;
  }

  setWriteExpertCallback(fn: (address: number, rawValue: number, isCoil: boolean) => Promise<void>): void {
    this.onWriteExpert = fn;
  }

  setGetTemperatureScaleCallback(fn: () => TemperatureRegisterScale): void {
    this.getTemperatureScale = fn;
  }

  /** Sla de meest recente snapshot op (overschrijft de vorige). */
  setSnapshot(snapshot: DataSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Start de HTTP-server. */
  start(): void {
    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res).catch((err: Error) => {
        this.logger('DashboardService: Onverwachte fout:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger(`DashboardService: Poort ${this.port} is al in gebruik — dashboard niet beschikbaar`);
      } else {
        this.logger('DashboardService: Server fout:', err.message);
      }
    });

    this.server.listen(this.port, () => {
      this.logger(`DashboardService: Gestart op http://localhost:${this.port}/`);
    });
  }

  /** Sluit de server en ruimt resources op. */
  destroy(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        this.logger('DashboardService: Gestopt');
        resolve();
      });
    });
  }

  // ── Request dispatcher ────────────────────────────────────────────────────────

  private async _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = (req.url ?? '/').split('?')[0];
    const method = (req.method ?? 'GET').toUpperCase();

    this._setCors(res);

    // OPTIONS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ADR-041: read-only dashboard
    if (method === 'GET' && (url === '/' || url === '/dashboard.html')) {
      await this._serveFile(res, 'dashboard.html');
      return;
    }
    if (method === 'GET' && url === '/api/snapshot') {
      this._serveSnapshot(res);
      return;
    }

    // ADR-044: interactief dashboard
    if (method === 'GET' && (url === '/interactive' || url === '/interactive.html')) {
      await this._serveFile(res, 'dashboard-interactive.html');
      return;
    }
    if (method === 'POST' && url === '/api/write') {
      await this._handleWrite(req, res);
      return;
    }

    // ADR-046: expert dashboard
    if (method === 'GET' && (url === '/expert' || url === '/expert.html')) {
      await this._serveFile(res, 'dashboard-expert.html');
      return;
    }
    if (method === 'GET' && url === '/api/registers') {
      const tempScale = this.getTemperatureScale?.() ?? 'x1';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(buildRegisterBlocks(tempScale)));
      return;
    }
    if (method === 'POST' && url === '/api/expert/read') {
      await this._handleExpertRead(req, res);
      return;
    }
    if (method === 'POST' && url === '/api/expert/write') {
      await this._handleExpertWrite(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private _setCors(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private _serveFile(res: http.ServerResponse, filename: string): Promise<void> {
    return new Promise((resolve) => {
      const filePath = path.join(this.publicDir, filename);
      fs.readFile(filePath, (err, content) => {
        if (err) {
          this.logger(`DashboardService: Fout bij laden ${filename}:`, err.message);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Error loading ${filename}`);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
        resolve();
      });
    });
  }

  private _serveSnapshot(res: http.ServerResponse): void {
    if (!this.snapshot) {
      res.writeHead(204);
      res.end();
      return;
    }
    // ADR-041b: JSON-replacer om floating point-getallen af te ronden.
    // Dit voorkomt weergaveproblemen zoals 1.2000000000000002 op het dashboard.
    const replacer = (key: string, value: unknown): unknown => {
      if (typeof value === 'number' && !Number.isInteger(value)) {
        // Rond af op 4 decimalen om onnodige precisie te verwijderen.
        return Math.round(value * 10000) / 10000;
      }
      return value;
    };
    const json = JSON.stringify(this.snapshot, replacer);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(json);
  }

  private _readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Ongeldige JSON body')); }
      });
      req.on('error', reject);
    });
  }

  private _jsonOk(res: http.ServerResponse, data?: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data ?? { ok: true }));
  }

  private _jsonError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: message }));
  }

  // ── ADR-044: POST /api/write ──────────────────────────────────────────────────

  private async _handleWrite(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.onWriteRegister) {
      this._jsonError(res, 503, 'Schrijf-callback niet beschikbaar');
      return;
    }

    let body: unknown;
    try { body = await this._readBody(req); } catch {
      this._jsonError(res, 400, 'Ongeldige JSON body');
      return;
    }

    const { key, value } = body as Record<string, unknown>;
    if (typeof key !== 'string' || typeof value !== 'number') {
      this._jsonError(res, 400, 'Verplichte velden: key (string), value (number)');
      return;
    }

    const meta = WRITABLE_REGISTERS[key];
    if (!meta) {
      this._jsonError(res, 400, `Onbekende registersleutel: "${key}"`);
      return;
    }

    const scaledMin = meta.min;
    const scaledMax = meta.max;
    if (value < scaledMin || value > scaledMax) {
      this._jsonError(res, 400, `Waarde buiten toegestaan bereik: min=${scaledMin}, max=${scaledMax}`);
      return;
    }

    const rawValue = Math.round(value / meta.multiply);

    try {
      await this.onWriteRegister(meta.address, rawValue);
      this._jsonOk(res);
    } catch (err) {
      this._jsonError(res, 500, (err as Error).message);
    }
  }

  // ── ADR-046: POST /api/expert/read ───────────────────────────────────────────

  private async _handleExpertRead(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.onReadRegister) {
      this._jsonError(res, 503, 'Lees-callback niet beschikbaar');
      return;
    }

    let body: unknown;
    try { body = await this._readBody(req); } catch {
      this._jsonError(res, 400, 'Ongeldige JSON body');
      return;
    }

    const { address, isCoil, isInput, fc, multiply } = body as Record<string, unknown>;
    if (typeof address !== 'number' || address < 0 || address > 0xFFFF) {
      this._jsonError(res, 400, 'Verplicht veld: address (number 0–65535)');
      return;
    }

    const coil = isCoil === true;
    const input = isInput === true || fc === 'input';
    const multiplyFactor = typeof multiply === 'number' ? multiply : 1;
    const tempScale = this.getTemperatureScale?.() ?? 'x10';

    try {
      const rawValue = await this.onReadRegister(address, coil, input);
      const signedRaw = rawValue > 0x7FFF ? rawValue - 0x10000 : rawValue;
      const scaledValue = Math.round((tempScale === 'x10' ? signedRaw * multiplyFactor : rawValue * multiplyFactor) * 10) / 10;
      this._jsonOk(res, { ok: true, rawValue, scaledValue });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg === 'Niet verbonden' ? 503 : 500;
      this._jsonError(res, status, msg);
    }
  }

  // ── ADR-046: POST /api/expert/write ──────────────────────────────────────────

  private async _handleExpertWrite(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.onWriteExpert) {
      this._jsonError(res, 503, 'Expert schrijf-callback niet beschikbaar');
      return;
    }

    let body: unknown;
    try { body = await this._readBody(req); } catch {
      this._jsonError(res, 400, 'Ongeldige JSON body');
      return;
    }

    const { address, rawValue, isCoil } = body as Record<string, unknown>;
    if (typeof address !== 'number' || address < 0 || address > 0xFFFF) {
      this._jsonError(res, 400, 'Verplicht veld: address (number 0–65535)');
      return;
    }
    if (typeof rawValue !== 'number') {
      this._jsonError(res, 400, 'Verplicht veld: rawValue (number)');
      return;
    }
    const coil = isCoil === true;
    const clampedRaw = Math.round(rawValue) & 0xFFFF;

    if (coil && clampedRaw > 1) {
      this._jsonError(res, 400, 'Coil waarde moet 0 of 1 zijn');
      return;
    }

    try {
      await this.onWriteExpert(address, clampedRaw, coil);
      this._jsonOk(res);
    } catch (err) {
      this._jsonError(res, 500, (err as Error).message);
    }
  }

}

// ── Registermetadata builder voor /api/registers ─────────────────────────────

function buildRegisterBlocks(tempScale: TemperatureRegisterScale = 'x10'): RegisterBlock[] {
  return [
    {
      id: 'blok1_input',
      label: 'Aurora III — Input registers (FC04 / 3-NNNN)',
      readOnly: true,
      registers: Object.entries(ALL_INPUT_REGISTERS).map(([key, def]) => ({
        key,
        address: (def as { address: number }).address,
        name: (def as { name: string }).name,
        unit: (def as { unit?: string }).unit,
        multiply: (def as { multiply?: number }).multiply,
        scaleMultiply: _scaleMultiplyForDef(def, tempScale),
        isTemperatureRegister: _isTemperatureDef(def),
        readOnly: true,
        fc: 'input',
        bits: key === 'systemStatus' ? STATUS_BITS : undefined,
        pollGroups: _pollGroupsForAddress((def as { address: number }).address, 'input'),
      })),
    },
    {
      id: 'blok2_control',
      label: 'Aurora III — Holding registers (FC03/FC06 / 4-NNNN)',
      readOnly: false,
      registers: Object.entries(ALL_HOLDING_REGISTERS).map(([key, def]) => ({
        key,
        address: (def as { address: number }).address,
        name: (def as { name: string }).name,
        unit: (def as { unit?: string }).unit,
        multiply: (def as { multiply?: number }).multiply,
        scaleMultiply: _scaleMultiplyForDef(def, tempScale),
        isTemperatureRegister: _isTemperatureDef(def),
        min: (def as { min?: number }).min,
        max: (def as { max?: number }).max,
        default: (def as { default?: number }).default,
        desc: (def as { desc?: string }).desc,
        readOnly: key === 'zone1AutoHeatingSetTemp' || (def as { readOnly?: boolean }).readOnly === true,
        fc: 'holding',
        pollGroups: _pollGroupsForAddress((def as { address: number }).address, 'holding'),
      })),
    },
  ];
}

function _pollGroupsForAddress(address: number, fc: 'input' | 'holding'): string[] {
  const groups = [
    {
      name: 'superfast',
      reads: [
        { start: 38, count: 2, fc: 'input' },
        { start: 43, count: 1, fc: 'input' },
        { start: 64, count: 1, fc: 'input' },
        { start: 79, count: 1, fc: 'input' },
      ],
    },
    {
      name: 'fast',
      reads: [
        { start: 40, count: 17, fc: 'input' },
        { start: 62, count: 3, fc: 'input' },
        { start: 70, count: 10, fc: 'input' },
        { start: 80, count: 2, fc: 'input' },
        { start: 2100, count: 15, fc: 'holding' },
      ],
    },
    {
      name: 'medium',
      reads: [
        { start: 60, count: 2, fc: 'input' },
        { start: 86, count: 18, fc: 'input' },
      ],
    },
    {
      name: 'slow',
      reads: [
        { start: 10, count: 22, fc: 'input' },
      ],
    },
    {
      name: 'once',
      reads: [
        { start: 2100, count: 15, fc: 'holding' },
      ],
    },
  ];

  return groups
    .filter((group) => group.reads.some((read) => read.fc === fc && address >= read.start && address < read.start + read.count))
    .map((group) => group.name);
}

function _isTemperatureDef(def: unknown): boolean {
  const register = def as { unit?: string };
  return register.unit === '°C';
}

function _scaleMultiplyForDef(def: unknown, tempScale: TemperatureRegisterScale): number {
  const register = def as { multiply?: number };
  if (_isTemperatureDef(def)) {
    return tempScale === 'x10' ? 0.1 : 1;
  }
  return register.multiply ?? 1;
}
