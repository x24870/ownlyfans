import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import "./index.css";
import App from "./App";
import { suiClient, network } from "./utils/suiClient";

// Create a QueryClient instance for React Query
// React Query helps manage server state, caching, and synchronization
// React Query 用於管理服務器狀態、緩存和同步
const queryClient = new QueryClient();

// Use the shared SuiClient instance
// 使用共享的 SuiClient 實例
// This ensures type compatibility between dapp-kit and Walrus SDK
// 這確保 dapp-kit 和 Walrus SDK 之間的類型兼容性

// SuiClientProvider: Provides Sui blockchain client context to the app
// This allows components to access Sui network and make blockchain queries
// SuiClientProvider: 為應用提供 Sui 區塊鏈客戶端上下文
// 這允許組件訪問 Sui 網絡並進行區塊鏈查詢
//
// WalletProvider: Provides wallet connection context
// This enables components to connect to Sui Wallet browser extension
// WalletProvider: 提供錢包連接上下文
// 這使組件能夠連接到 Sui Wallet 瀏覽器擴展
//
// Workflow: User installs Sui Wallet extension → clicks connect →
// WalletProvider detects extension → user approves connection →
// app receives wallet address and can sign transactions
// 工作流程：用戶安裝 Sui Wallet 擴展 → 點擊連接 →
// WalletProvider 檢測擴展 → 用戶批准連接 →
// 應用接收錢包地址並可以簽署交易
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Pass the shared SuiClient instance to SuiClientProvider */}
      {/* 將共享的 SuiClient 實例傳遞給 SuiClientProvider */}
      {/* This ensures the same client is used for both dapp-kit and Walrus */}
      {/* 這確保相同的客戶端用於 dapp-kit 和 Walrus */}
      <SuiClientProvider
        networks={{ [network]: suiClient } as any}
        defaultNetwork={network}
      >
        <WalletProvider>
    <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
