import { useState } from "react";
import { useCurrentAccount, ConnectButton } from "@mysten/dapp-kit";
import CreatorDashboard from "./pages/CreatorDashboard";
import FanDashboard from "./pages/FanDashboard";
import RevenueDashboard from "./pages/RevenueDashboard";
import "./App.css";

function App() {
  const account = useCurrentAccount();
  const [view, setView] = useState<"creator" | "fan" | "revenue">("fan");

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      <header style={{ marginBottom: "30px", textAlign: "center" }}>
        <h1 style={{ color: "#1976d2", marginBottom: "10px" }}>
          Ownlyfans PoC
        </h1>
        <p style={{ color: "#888", marginTop: "10px" }}>
          Decentralized content platform with referral rewards
          <br />
          去中心化內容平台，帶有推廣獎勵
        </p>
      </header>

      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <ConnectButton />
      </div>

      {!account ? (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p>Please connect your wallet to continue</p>
          <p style={{ color: "#666" }}>請連接您的錢包以繼續</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <button
              onClick={() => setView("creator")}
              style={{
                padding: "10px 20px",
                margin: "0 10px",
                backgroundColor: view === "creator" ? "#1976d2" : "#f0f0f0",
                color: view === "creator" ? "white" : "black",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Creator Dashboard / 創作者儀表板
            </button>
            <button
              onClick={() => setView("fan")}
              style={{
                padding: "10px 20px",
                margin: "0 10px",
                backgroundColor: view === "fan" ? "#1976d2" : "#f0f0f0",
                color: view === "fan" ? "white" : "black",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Fan Dashboard / 粉絲儀表板
            </button>
            <button
              onClick={() => setView("revenue")}
              style={{
                padding: "10px 20px",
                margin: "0 10px",
                backgroundColor: view === "revenue" ? "#1976d2" : "#f0f0f0",
                color: view === "revenue" ? "white" : "black",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Revenue Dashboard / 收益儀表板
            </button>
          </div>

          {view === "creator" ? (
            <CreatorDashboard />
          ) : view === "fan" ? (
            <FanDashboard />
          ) : (
            <RevenueDashboard />
          )}
        </>
      )}
    </div>
  );
}

export default App;
