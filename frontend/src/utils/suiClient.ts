/**
 * Shared SuiClient Instance
 * 共享的 SuiClient 實例
 *
 * This file exports a single SuiClient instance that is used throughout the app.
 * 此文件導出一個在整個應用中使用的單一 SuiClient 實例。
 *
 * Why this is important:
 * 為什麼這很重要：
 * - Ensures type compatibility between dapp-kit and Walrus SDK
 *   確保 dapp-kit 和 Walrus SDK 之間的類型兼容性
 * - Prevents "scope" property errors when creating WalrusClient
 *   防止創建 WalrusClient 時的 "scope" 屬性錯誤
 * - Ensures CoinWithBalance intent works correctly for transaction signing
 *   確保 CoinWithBalance intent 正確工作以進行交易簽名
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

// Create a single SuiClient instance for the testnet network
// 為 testnet 網絡創建單一 SuiClient 實例
// This instance will be shared across dapp-kit and Walrus SDK
// 此實例將在 dapp-kit 和 Walrus SDK 之間共享
export const suiClient = new SuiClient({
  url: getFullnodeUrl("testnet"),
});

// Network configuration for dapp-kit
// dapp-kit 的網絡配置
export const network = "testnet" as const;

