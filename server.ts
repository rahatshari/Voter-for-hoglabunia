import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Single Active Device Session Store
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
interface SessionRecord {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}
let activeSessions: Record<string, SessionRecord> = {};

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      activeSessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (e) {
    activeSessions = {};
  }
}

function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(activeSessions, null, 2), 'utf8');
  } catch (e: any) {
    console.error('Error saving sessions:', e.message);
  }
}

loadSessions();

// Function to scan and load villages from single JSON files or folders
function loadVillagesData() {
  const villagesData: Record<string, any[]> = {};
  const processedVillages = new Set<string>();

  function processSingleVillageFile(filePath: string) {
    if (!fs.existsSync(filePath) || !filePath.endsWith('.json')) return;
    const baseName = path.basename(filePath);
    if (
      baseName === 'villages.json' ||
      baseName === 'sessions.json' ||
      baseName === 'package.json' ||
      baseName === 'metadata.json' ||
      baseName === 'manifest.json' ||
      baseName === 'tsconfig.json' ||
      baseName.startsWith('.')
    ) {
      return;
    }

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let villageName = '';
      let voters: any[] = [];

      if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object' && content[0] !== null) {
        voters = content;
        villageName = voters[0]?.villageName || path.basename(filePath, '.json');
      } else if (content && typeof content === 'object') {
        villageName = content.villageName || content.name || path.basename(filePath, '.json');
        if (Array.isArray(content.voters)) {
          voters = content.voters;
        } else if (Array.isArray(content.data)) {
          voters = content.data;
        }
      }

      if (voters.length > 0 && villageName) {
        if (villageName === 'pathamara') villageName = 'পাঠামারা';
        if (villageName === 'cotobadura') villageName = 'ছোট বাদুরা';

        const standardized = voters.map((v) => ({
          ...v,
          gender: v.gender || 'পুরুষ',
          villageName: v.villageName || villageName,
        }));

        villagesData[villageName] = standardized;
        processedVillages.add(villageName);
      }
    } catch (e: any) {
      console.error(`Error reading village JSON file ${filePath}:`, e.message);
    }
  }

  function scanFolder(dirPath: string, defaultName: string) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return;

    let villageName = defaultName;
    const infoFiles = ['info.json', 'village.json', 'গ্রাম.json'];
    for (const infoFile of infoFiles) {
      const p = path.join(dirPath, infoFile);
      if (fs.existsSync(p)) {
        try {
          const info = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (info.name) {
            villageName = info.name;
            break;
          }
        } catch (e) {}
      }
    }

    if (!villageName) villageName = path.basename(dirPath);
    if (processedVillages.has(villageName)) return;

    let maleList: any[] = [];
    const maleFileNames = ['male.json', 'purush.json', 'পুরুষ.json', 'males.json', 'men.json'];
    for (const mf of maleFileNames) {
      const p = path.join(dirPath, mf);
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(parsed)) {
            maleList = parsed.map((v) => ({
              ...v,
              gender: v.gender || 'পুরুষ',
              villageName,
            }));
            break;
          }
        } catch (e: any) {
          console.error(`Error reading ${p}:`, e.message);
        }
      }
    }

    let femaleList: any[] = [];
    const femaleFileNames = ['female.json', 'nari.json', 'মহিলা.json', 'females.json', 'women.json'];
    for (const ff of femaleFileNames) {
      const p = path.join(dirPath, ff);
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(parsed)) {
            femaleList = parsed.map((v) => ({
              ...v,
              gender: v.gender || 'মহিলা',
              villageName,
            }));
            break;
          }
        } catch (e: any) {
          console.error(`Error reading ${p}:`, e.message);
        }
      }
    }

    if (maleList.length > 0 || femaleList.length > 0) {
      villagesData[villageName] = [...maleList, ...femaleList];
      processedVillages.add(villageName);
    }
  }

  // 1. Scan single JSON files in /villages directory first (Primary)
  const villagesDir = path.join(__dirname, 'villages');
  if (fs.existsSync(villagesDir)) {
    const entries = fs.readdirSync(villagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        processSingleVillageFile(path.join(villagesDir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('_')) {
        scanFolder(path.join(villagesDir, entry.name), entry.name);
      }
    }
  }

  // 2. Scan root single JSON files or folders as fallback
  const ignoredRoot = new Set(['node_modules', '.git', 'villages', 'public', 'dist', 'build', 'src', '.aistudio']);
  const rootEntries = fs.readdirSync(__dirname, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
      processSingleVillageFile(path.join(__dirname, entry.name));
    } else if (entry.isDirectory() && !ignoredRoot.has(entry.name) && !entry.name.startsWith('.')) {
      scanFolder(path.join(__dirname, entry.name), entry.name);
    }
  }

  return villagesData;
}

// API endpoint to get all voter data loaded from JSON files
app.get('/api/villages-data', (_req: Request, res: Response) => {
  try {
    const data = loadVillagesData();
    res.json(data);
  } catch (err) {
    console.error('Error fetching villages data:', err);
    res.status(500).json({ error: 'Failed to load villages data' });
  }
});

// API endpoint to get summary list of villages
app.get('/api/villages', (_req: Request, res: Response) => {
  try {
    const data = loadVillagesData();
    const summary = Object.keys(data).map((village) => {
      const voters = data[village];
      const males = voters.filter((v) => v.gender === 'পুরুষ').length;
      const females = voters.filter((v) => v.gender === 'মহিলা').length;
      return {
        name: village,
        total: voters.length,
        males,
        females,
      };
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load villages summary' });
  }
});

// Single Active Device Session API
// 1. Register or takeover active session for an email
app.post('/api/session/register', (req: Request, res: Response) => {
  const { email, sessionId, deviceName } = req.body || {};
  if (!email || !sessionId) {
    return res.status(400).json({ error: 'Email and sessionId are required' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  activeSessions[cleanEmail] = {
    sessionId: String(sessionId),
    email: cleanEmail,
    deviceName: deviceName || 'Mobile',
    registeredAt: Date.now(),
    lastActive: Date.now(),
  };
  saveSessions();
  res.json({ success: true, sessionId: String(sessionId) });
});

// 2. Validate whether current session is still the single active session
app.get('/api/session/validate', (req: Request, res: Response) => {
  const email = req.query.email as string;
  const sessionId = req.query.sessionId as string;

  if (!email || !sessionId) {
    return res.status(400).json({ isValid: false, reason: 'missing_params' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const current = activeSessions[cleanEmail];

  if (!current) {
    activeSessions[cleanEmail] = {
      sessionId: String(sessionId),
      email: cleanEmail,
      registeredAt: Date.now(),
      lastActive: Date.now(),
    };
    saveSessions();
    return res.json({ isValid: true });
  }

  if (current.sessionId === String(sessionId)) {
    current.lastActive = Date.now();
    return res.json({ isValid: true });
  }

  return res.json({
    isValid: false,
    reason: 'another_device_logged_in',
    registeredAt: current.registeredAt,
  });
});

// 3. Terminate session on manual logout
app.post('/api/session/logout', (req: Request, res: Response) => {
  const { email, sessionId } = req.body || {};
  if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (activeSessions[cleanEmail] && (!sessionId || activeSessions[cleanEmail].sessionId === String(sessionId))) {
      delete activeSessions[cleanEmail];
      saveSessions();
    }
  }
  res.json({ success: true });
});

// Serve static assets from public/ and villages/
app.use(express.static(path.join(__dirname, 'public')));
app.use('/villages', express.static(path.join(__dirname, 'villages')));
app.get('/logo.png', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'logo.png')));
app.get('/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

async function start() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'))) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Development mode: Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    // Serve Vite transformed index.html for any SPA route
    app.use('*', async (req: Request, res: Response, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

start();
