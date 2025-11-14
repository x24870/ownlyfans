import { walrus, type WalrusClient } from "@mysten/walrus";
import type { ClientWithCoreApi } from "@mysten/sui/experimental";
import type { Transaction } from "@mysten/sui/transactions";
import { suiClient, network } from "./suiClient";

/**
 * Walrus Helper Functions
 *
 * This file contains utility functions for interacting with Walrus decentralized storage.
 * 此文件包含與 Walrus 去中心化存儲交互的實用函數。
 */

/**
 * Create a WalrusClient instance using the shared SuiClient
 * 使用共享的 SuiClient 創建 WalrusClient 實例
 *
 * @returns WalrusClient instance
 */
export function createWalrusClient(): WalrusClient {
  // Use the shared SuiClient instance with walrus extension
  // 使用共享的 SuiClient 實例和 walrus 擴展
  return walrus({ network }).register(suiClient as ClientWithCoreApi);
}

/**
 * Upload a file to Walrus
 * 上傳文件到 Walrus
 *
 * @param client - WalrusClient instance
 * @param fileBytes - File contents as Uint8Array
 * @param owner - Sui address of the file owner
 * @param signAndExecute - Function to sign and execute transactions
 * @param epochs - Number of epochs to store the file (default: 10)
 * @param deletable - Whether the blob can be deleted (default: true)
 * @returns Promise resolving to blob ID and blob object ID
 */
export async function uploadFileToWalrus(
  client: WalrusClient,
  fileBytes: Uint8Array,
  owner: string,
  signAndExecute: (transaction: Transaction) => Promise<{ digest: string }>,
  epochs: number = 10,
  deletable: boolean = true
): Promise<{ blobId: string; blobObjectId: string }> {
  // Step 1: Create a write flow for the blob
  const flow = client.writeBlobFlow({ blob: fileBytes });

  // Step 2: Encode the file
  await flow.encode();

  // Step 3: Register the blob on Sui blockchain
  const registerTx = flow.register({
    owner,
    epochs,
    deletable,
  });

  // Execute the registration transaction
  const registerResult = await signAndExecute(registerTx);

  // Step 4: Upload chunks to storage nodes
  await flow.upload({ digest: registerResult.digest });

  // Step 5: Certify the blob storage
  const certifyTx = flow.certify();

  // Execute the certification transaction
  await signAndExecute(certifyTx);

  // Step 6: Get the blob information
  const blobInfo = await flow.getBlob();

  return {
    blobId: blobInfo.blobId,
    blobObjectId: blobInfo.blobObject.id.id,
  };
}

/**
 * Read a file from Walrus using aggregator API
 * 使用 aggregator API 從 Walrus 讀取文件
 *
 * @param _client - WalrusClient instance (not used, kept for compatibility)
 * @param blobId - The blob ID of the file to retrieve
 * @param network - Network name (default: "testnet")
 * @returns Promise resolving to file contents as Uint8Array
 */
export async function readFileFromWalrus(
  _client: WalrusClient,
  blobId: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<Uint8Array> {
  // Use aggregator API to fetch the blob
  // 使用 aggregator API 獲取 blob
  const aggregatorUrl = `https://aggregator.walrus-${network}.walrus.space/v1/blobs/${blobId}`;

  const response = await fetch(aggregatorUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch blob from Walrus: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
