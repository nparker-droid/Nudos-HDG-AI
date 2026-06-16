import { Project, LibraryNode } from '../types.ts';

const DRIVE_API    = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPES       = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME  = 'Nudos Hidrogestion';
const FILE_NAME    = 'nudos-backup.json';

const SYNC_TIMESTAMP_KEY = 'nudos_drive_last_sync';
const FOLDER_ID_CACHE_KEY = 'nudos_drive_folder_id';
const TOKEN_KEY           = 'nudos_drive_token';
const TOKEN_EXPIRY_KEY    = 'nudos_drive_token_expiry';
const WANTS_CONNECTED_KEY = 'nudos_drive_wants_connected';

export const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';

interface DriveBackup {
  version:      string;
  savedAt:      string;
  projects:     Project[];
  libraryNodes: LibraryNode[];
  credits:      number;
}

let tokenClient: any  = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

const loadSavedToken = (): void => {
  try {
    const saved  = localStorage.getItem(TOKEN_KEY);
    const expiry = parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0', 10);
    if (saved && expiry && Date.now() < expiry) { accessToken = saved; tokenExpiry = expiry; }
  } catch { /**/ }
};

const persistToken = (token: string, expiresIn: number): void => {
  const expiry = Date.now() + expiresIn * 1000 - 60_000;
  accessToken = token; tokenExpiry = expiry;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
    localStorage.setItem(WANTS_CONNECTED_KEY, 'true');
  } catch { /**/ }
};

const clearToken = (): void => {
  accessToken = null; tokenExpiry = 0;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(FOLDER_ID_CACHE_KEY);
  } catch { /**/ }
};

const isTokenValid = () => !!(accessToken && Date.now() < tokenExpiry);

const parseDriveError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    const err  = data?.error;
    if (!err) return `Error ${response.status}`;
    if (response.status === 403 && err.errors?.[0]?.reason === 'SERVICE_DISABLED')
      return 'Google Drive API no habilitada. Ve a console.cloud.google.com → APIs → Google Drive API → Habilitar.';
    if (response.status === 403) return 'Permiso denegado. Verifica que el dominio esté autorizado en Google Cloud Console.';
    if (response.status === 401) { clearToken(); return 'Sesión expirada. Vuelve a conectar.'; }
    return err.message || `Error ${response.status}`;
  } catch { return `Error ${response.status}: ${response.statusText}`; }
};

const loadGis = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) { resolve(); return; }
    const script    = document.createElement('script');
    script.src      = 'https://accounts.google.com/gsi/client';
    script.async    = true;
    script.onload   = () => resolve();
    script.onerror  = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });

export const initDriveAuth = async (): Promise<void> => {
  if (!GOOGLE_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID no configurado en Vercel.');
  await loadGis();
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: () => {}
  });
};

export const requestDriveAccess = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('Drive no inicializado.')); return; }
    if (isTokenValid()) { resolve(); return; }
    tokenClient.callback = (response: any) => {
      if (response.error) { reject(new Error(response.error_description || response.error)); return; }
      persistToken(response.access_token, response.expires_in);
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });

export const autoReconnectDrive = async (): Promise<boolean> => {
  if (!GOOGLE_CLIENT_ID) return false;
  if (localStorage.getItem(WANTS_CONNECTED_KEY) !== 'true') return false;
  loadSavedToken();
  if (isTokenValid()) return true;
  try { await initDriveAuth(); await requestDriveAccess(); return isTokenValid(); }
  catch { return false; }
};

export const isDriveConnected = () => isTokenValid();

export const disconnectDrive = () => {
  if (accessToken) (window as any).google?.accounts?.oauth2?.revoke?.(accessToken);
  clearToken();
  try { localStorage.removeItem(WANTS_CONNECTED_KEY); } catch { /**/ }
};

const driveRequest = async (url: string, options: RequestInit = {}): Promise<Response> => {
  if (!isTokenValid()) await requestDriveAccess();
  const response = await fetch(url, {
    ...options, headers: { 'Authorization': `Bearer ${accessToken}`, ...options.headers }
  });
  if (!response.ok) { const msg = await parseDriveError(response.clone()); throw new Error(msg); }
  return response;
};

const getOrCreateFolder = async (): Promise<string> => {
  const cached = localStorage.getItem(FOLDER_ID_CACHE_KEY);
  if (cached) return cached;
  const q   = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest(`${DRIVE_API}/files?q=${q}&fields=files(id)&spaces=drive`);
  const data = await res.json();
  if (data.files?.length > 0) {
    localStorage.setItem(FOLDER_ID_CACHE_KEY, data.files[0].id);
    return data.files[0].id;
  }
  const createRes = await driveRequest(`${DRIVE_API}/files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });
  const folder = await createRes.json();
  localStorage.setItem(FOLDER_ID_CACHE_KEY, folder.id);
  return folder.id;
};

const findBackupFileId = async (folderId: string): Promise<string | null> => {
  const q   = encodeURIComponent(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`);
  const res = await driveRequest(`${DRIVE_API}/files?q=${q}&fields=files(id)&spaces=drive`);
  const data = await res.json();
  return data.files?.[0]?.id || null;
};

export const saveAllToDrive = async (projects: Project[], libraryNodes: LibraryNode[], credits: number): Promise<void> => {
  const backup: DriveBackup = {
    version: '2.0',
    savedAt: new Date().toISOString(),
    projects,
    libraryNodes,
    credits,
  };
  const folderId   = await getOrCreateFolder();
  const existingId = await findBackupFileId(folderId);
  const content    = JSON.stringify(backup, null, 2);

  if (existingId) {
    await driveRequest(`${DRIVE_UPLOAD}/files/${existingId}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
    });
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: FILE_NAME, parents: [folderId] })], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));
    await driveRequest(`${DRIVE_UPLOAD}/files?uploadType=multipart`, { method: 'POST', body: form });
  }
  localStorage.setItem(SYNC_TIMESTAMP_KEY, new Date().toISOString());
};

export const loadFromDrive = async (): Promise<DriveBackup | null> => {
  const folderId = await getOrCreateFolder();
  const fileId   = await findBackupFileId(folderId);
  if (!fileId) return null;
  const res     = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
  const backup: DriveBackup = await res.json();
  // Restaurar en localStorage para que los setState los lean
  localStorage.setItem('hidrogestion_v10_projects', JSON.stringify(backup.projects || []));
  localStorage.setItem('hidrogestion_v10_library',  JSON.stringify(backup.libraryNodes || []));
  if (backup.credits !== undefined) localStorage.setItem('hidrogestion_v10_credits', String(backup.credits));
  localStorage.setItem(SYNC_TIMESTAMP_KEY, new Date().toISOString());
  return backup;
};

export const getLastSyncTime = (): string | null => localStorage.getItem(SYNC_TIMESTAMP_KEY);
