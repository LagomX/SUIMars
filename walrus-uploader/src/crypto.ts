import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export const generateEncryptionKey = (): Buffer => randomBytes(KEY_BYTES);

export const encryptJson = (
  data: unknown,
): { ciphertext: Buffer; keyHex: string; ivHex: string; authTagHex: string } => {
  const key = generateEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  if (ciphertext.length === 0) {
    throw new Error("Encryption produced empty ciphertext");
  }

  return {
    ciphertext,
    keyHex: key.toString("hex"),
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
  };
};

export const decryptJson = (
  ciphertext: Buffer,
  keyHex: string,
  ivHex: string,
  authTagHex: string,
): unknown => {
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
};
