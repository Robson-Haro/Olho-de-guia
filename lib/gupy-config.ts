import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SETTING_KEY = 'gupy_api_token';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase ainda não foi configurado no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function encryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split('.').map(item => Buffer.from(item, 'base64'));
  if (!iv || !tag || !encrypted) throw new Error('Token armazenado em formato inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export async function getGupyToken() {
  const { data, error } = await supabaseAdmin().from('app_settings').select('encrypted_value, updated_at').eq('key', SETTING_KEY).maybeSingle();
  if (error) throw new Error(`Falha ao consultar configuração: ${error.message}`);
  return data ? { token: decrypt(data.encrypted_value), updatedAt: data.updated_at as string } : null;
}

export async function saveGupyToken(token: string) {
  const { error } = await supabaseAdmin().from('app_settings').upsert({ key: SETTING_KEY, encrypted_value: encrypt(token), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Falha ao salvar configuração: ${error.message}`);
}

export async function testGupyToken(token: string) {
  const base = process.env.GUPY_API_BASE_URL || 'https://api.gupy.io/api/v1';
  const response = await fetch(`${base}/jobs?limit=1`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Token recusado pela Gupy.' : `A Gupy respondeu com o código ${response.status}.`);
  return true;
}
