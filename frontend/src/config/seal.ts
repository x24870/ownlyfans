/**
 * Seal SDK configuration
 *
 * Centralizes policy package ID, key server list, and thresholds used across the app.
 * Key server object IDs are fetched from the official documentation:
 * https://seal-docs.wal.app/Pricing/#verified-key-servers
 */

export interface SealKeyServerConfig {
  name: string;
  objectId: string;
  url: string;
  weight?: number;
  apiKeyName?: string;
  apiKey?: string;
}

/**
 * Mysten Labs provides two open-mode key servers on testnet that we can use for PoC purposes.
 * Each server gets the same weight so the majority threshold is satisfied when both respond.
 */
export const SEAL_KEY_SERVERS: SealKeyServerConfig[] = [
  {
    name: "mysten-testnet-1",
    objectId:
      "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    url: "https://seal-key-server-testnet-1.mystenlabs.com",
    weight: 1,
  },
  {
    name: "mysten-testnet-2",
    objectId:
      "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
    url: "https://seal-key-server-testnet-2.mystenlabs.com",
    weight: 1,
  },
];

/**
 * Default threshold: require responses from both testnet servers.
 * Increase or decrease when adding more servers.
 */
export const SEAL_THRESHOLD = 2;

/**
 * TTL used when creating session keys (Seal requires the window to be between 1 and 30 minutes).
 */
export const SEAL_SESSION_TTL_MINUTES = 10;

/**
 * Whether SealClient should verify key server authenticity (recommended).
 */
export const SEAL_VERIFY_KEY_SERVERS = true;

/**
 * Policy package ID deployed on-chain. Wire this via Vite env once available.
 * Example: VITE_SEAL_POLICY_PACKAGE_ID=0x123...
 */
export const SEAL_POLICY_PACKAGE_ID =
  import.meta.env.VITE_SEAL_POLICY_PACKAGE_ID ??
  "0x962338f67350fc914b7f5c27b06084df75050a2bc57629a7ca051f542b4e3efe";

/**
 * Helper to validate that a policy package ID is configured before using Seal.
 */
export function assertSealPackageId(packageId: string): string {
  const resolved = packageId || SEAL_POLICY_PACKAGE_ID;
  if (!resolved) {
    throw new Error(
      "Seal policy package ID is not configured. Set VITE_SEAL_POLICY_PACKAGE_ID."
    );
  }
  return resolved;
}
