import { createCipheriv, randomBytes } from "node:crypto";

export const ENCRYPTION_ALGORITHM = "AES-256-GCM";

const KEY_BYTES = 32;
const IV_BYTES = 12;

export type EncryptionResult = {
  ciphertext: Buffer;
  key: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export const encryptBytes = (plaintext: Buffer): EncryptionResult => {
  if (plaintext.length === 0) {
    throw new Error("Refusing to encrypt an empty dataset");
  }

  const key = randomBytes(KEY_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  if (ciphertext.length === 0) {
    throw new Error("Encryption produced empty ciphertext");
  }

  return { ciphertext, key, iv, authTag };
};
