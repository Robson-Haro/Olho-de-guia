import crypto from "node:crypto";

const TOKEN_VERSION = "eureka-clay-v1";
const MAX_SESSION_AGE_MS = 45 * 60 * 1000;

export type ClaySearchSession = {
  searchId: string;
  queryFingerprint: string;
  expiresAt: number;
};

function encryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * O search_id do Clay é um cursor do fornecedor. Ele não é enviado ao navegador
 * em texto aberto; o cliente recebe apenas um token cifrado e temporário.
 */
export function issueClaySearchSession(searchId: string, queryFingerprint: string) {
  const session: ClaySearchSession = {
    searchId,
    queryFingerprint,
    expiresAt: Date.now() + MAX_SESSION_AGE_MS,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function readClaySearchSession(token: string, expectedFingerprint: string) {
  try {
    const [version, ivValue, tagValue, encryptedValue] = token.split(".");
    if (version !== TOKEN_VERSION || !ivValue || !tagValue || !encryptedValue) throw new Error("invalid");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const session = JSON.parse(decrypted) as Partial<ClaySearchSession>;
    if (
      typeof session.searchId !== "string"
      || session.queryFingerprint !== expectedFingerprint
      || typeof session.expiresAt !== "number"
      || session.expiresAt < Date.now()
    ) throw new Error("invalid");
    return session as ClaySearchSession;
  } catch {
    throw new Error("A sessão de continuação do Clay expirou ou não corresponde a esta busca. Inicie uma nova busca.");
  }
}
