import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase ainda não foi configurado no servidor.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function encryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Credencial armazenada em formato inválido.");
  const [iv, tag, encrypted] = parts.map((item) => Buffer.from(item, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function getSecret(key: string) {
  const { data, error } = await supabaseAdmin()
    .from("app_settings")
    .select("encrypted_value, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar configuração: ${error.message}`);
  return data
    ? { value: decrypt(data.encrypted_value), updatedAt: data.updated_at as string }
    : null;
}

export async function saveSecret(key: string, value: string) {
  const { error } = await supabaseAdmin().from("app_settings").upsert({
    key,
    encrypted_value: encrypt(value),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Falha ao salvar configuração: ${error.message}`);
}
