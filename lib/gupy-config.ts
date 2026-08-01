import { getSecret, saveSecret } from "@/lib/secure-settings";

const SETTING_KEY = 'gupy_api_token';

export async function getGupyToken() {
  const saved = await getSecret(SETTING_KEY);
  return saved ? { token: saved.value, updatedAt: saved.updatedAt } : null;
}

export async function saveGupyToken(token: string) {
  await saveSecret(SETTING_KEY, token);
}

export async function testGupyToken(token: string) {
  const base = process.env.GUPY_API_BASE_URL || 'https://api.gupy.io/api/v1';
  const response = await fetch(`${base}/jobs?limit=1`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Token recusado pela Gupy.' : `A Gupy respondeu com o código ${response.status}.`);
  return true;
}
