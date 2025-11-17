import { SealClient, SessionKey } from "@mysten/seal";
import type { KeyServerConfig } from "@mysten/seal";
import { fromB64, fromHex, normalizeSuiAddress } from "@mysten/sui/utils";
import { suiClient } from "./suiClient";
import {
  SEAL_KEY_SERVERS,
  SEAL_THRESHOLD,
  SEAL_VERIFY_KEY_SERVERS,
  SEAL_SESSION_TTL_MINUTES,
  SEAL_POLICY_PACKAGE_ID,
  assertSealPackageId,
} from "../config/seal";

type VectorLike = string | number[] | Uint8Array;

const keyServerConfigs: KeyServerConfig[] = SEAL_KEY_SERVERS.map(
  ({ objectId, weight = 1, apiKey, apiKeyName }) => ({
    objectId,
    weight,
    apiKey,
    apiKeyName,
  })
);

let sealClientInstance: SealClient | null = null;
let cachedSessionKey: {
  address: string;
  packageId: string;
  sessionKey: SessionKey;
} | null = null;

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function vectorToBytes(value: VectorLike): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("0x") || /^[0-9a-f]+$/i.test(trimmed)) {
    return fromHex(strip0x(trimmed));
  }

  // Fallback to Base64 (Sui vectors are encoded this way in JSON responses)
  return fromB64(trimmed);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function getSealClient(): SealClient {
  if (!sealClientInstance) {
    sealClientInstance = new SealClient({
      suiClient: suiClient as unknown as any,
      serverConfigs: keyServerConfigs,
      verifyKeyServers: SEAL_VERIFY_KEY_SERVERS,
    });
  }
  return sealClientInstance;
}

/**
 * Encode the Seal identity from a creator namespace and seal suffix vector.
 * 將創作者命名空間與 seal 後綴組合為 Seal 身份。
 */
export function encodeSealIdentityFromNamespace(
  namespace: VectorLike,
  sealSuffix: VectorLike
): string {
  const namespaceHex = bytesToHex(vectorToBytes(namespace));
  const suffixHex = bytesToHex(vectorToBytes(sealSuffix));
  return namespaceHex + suffixHex;
}

/**
 * Encode the Seal identity directly from a creator address (BCS encoding of address).
 * 直接使用創作者地址（BCS 編碼）與 seal 後綴產生 Seal 身份。
 */
export function encodeSealIdentityFromAddress(
  creatorAddress: string,
  sealSuffix: VectorLike
): string {
  const namespaceHex = strip0x(
    normalizeSuiAddress(creatorAddress)
  ).toLowerCase();
  const suffixHex = bytesToHex(vectorToBytes(sealSuffix));
  return namespaceHex + suffixHex;
}

export interface SealEncryptParams {
  data: Uint8Array;
  sealIdHex: string;
  packageId?: string;
  threshold?: number;
  aad?: Uint8Array;
}

export interface SealEncryptResult {
  encryptedObject: Uint8Array;
  symmetricKey: Uint8Array;
}

/**
 * Encrypt arbitrary bytes using the Seal key servers.
 * 使用 Seal key server 加密任意位元組資料。
 */
export async function encryptWithSeal({
  data,
  sealIdHex,
  packageId = SEAL_POLICY_PACKAGE_ID,
  threshold = SEAL_THRESHOLD,
  aad,
}: SealEncryptParams): Promise<SealEncryptResult> {
  const resolvedPackageId = assertSealPackageId(packageId);
  const normalizedId = strip0x(sealIdHex).toLowerCase();

  const { encryptedObject, key } = await getSealClient().encrypt({
    threshold,
    packageId: resolvedPackageId,
    id: normalizedId,
    data,
    aad,
  });

  return {
    encryptedObject: new Uint8Array(encryptedObject),
    symmetricKey: new Uint8Array(key),
  };
}

export type PersonalMessageSigner = (message: Uint8Array) => Promise<string>;

/**
 * Create (or reuse) a session key for decrypting content via Seal.
 * 建立或重用 Seal Session Key，用於解密內容。
 */
export async function getOrCreateSessionKey(
  address: string,
  signer: PersonalMessageSigner,
  packageId: string = SEAL_POLICY_PACKAGE_ID,
  ttlMin: number = SEAL_SESSION_TTL_MINUTES
): Promise<SessionKey> {
  if (!signer) {
    throw new Error("A personal message signer is required to use Seal.");
  }

  const normalizedAddress = normalizeSuiAddress(address);
  const resolvedPackageId = assertSealPackageId(packageId);

  const reuseSession =
    cachedSessionKey &&
    cachedSessionKey.address === normalizedAddress &&
    cachedSessionKey.packageId === resolvedPackageId &&
    !cachedSessionKey.sessionKey.isExpired();

  if (!reuseSession) {
    const sessionKey = await SessionKey.create({
      address: normalizedAddress,
      packageId: resolvedPackageId,
      ttlMin,
      suiClient: suiClient as unknown as any,
    });

    cachedSessionKey = {
      address: normalizedAddress,
      packageId: resolvedPackageId,
      sessionKey,
    };
  }

  const sessionKey = cachedSessionKey!.sessionKey;
  const personalMessage = sessionKey.getPersonalMessage();
  const signature = await signer(personalMessage);
  await sessionKey.setPersonalMessageSignature(signature);

  return sessionKey;
}

export interface SealDecryptParams {
  encryptedData: Uint8Array;
  sessionKey: SessionKey;
  txBytes: Uint8Array;
  checkShareConsistency?: boolean;
  checkLEEncoding?: boolean;
}

/**
 * Decrypt encrypted bytes using Seal key shares.
 * 使用 Seal key shares 解密先前加密的位元組資料。
 */
export async function decryptWithSeal({
  encryptedData,
  sessionKey,
  txBytes,
  checkShareConsistency,
  checkLEEncoding,
}: SealDecryptParams): Promise<Uint8Array> {
  const plaintext = await getSealClient().decrypt({
    data: encryptedData,
    sessionKey,
    txBytes,
    checkShareConsistency,
    checkLEEncoding,
  });
  return new Uint8Array(plaintext);
}
