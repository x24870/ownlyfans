import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Configure Vite to properly handle WASM modules
  // 配置 Vite 以正確處理 WASM 模塊
  // Exclude WASM package from optimization so it loads at runtime
  // 從優化中排除 WASM 包，以便在運行時加載
  optimizeDeps: {
    exclude: ["@mysten/walrus-wasm"],
  },
  // Ensure WASM files are handled correctly
  // 確保 WASM 文件被正確處理
  assetsInclude: ["**/*.wasm"],
});
