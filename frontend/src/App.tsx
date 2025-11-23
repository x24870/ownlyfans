import { useState } from "react";
import { useCurrentAccount, ConnectButton } from "@mysten/dapp-kit";
import CreatorDashboard from "./pages/CreatorDashboard";
import FanDashboard from "./pages/FanDashboard";
import RevenueDashboard from "./pages/RevenueDashboard";
import "./App.css";

function App() {
  const account = useCurrentAccount();
  const [view, setView] = useState<"creator" | "fan" | "revenue">("fan");

  // Gradient button style
  const gradientButtonStyle = (isActive: boolean) => ({
    padding: "12px 24px",
    margin: "0 8px",
    background: isActive
      ? "linear-gradient(135deg, #34D0F8 0%, #A300FF 100%)"
      : "rgba(37, 41, 52, 0.8)",
    color: "#FFFFFF",
    border: isActive ? "none" : "1px solid rgba(52, 208, 248, 0.3)",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.95em",
    letterSpacing: "0.5px",
    transition: "all 0.3s ease",
    boxShadow: isActive
      ? "0 4px 20px rgba(163, 0, 255, 0.4), 0 0 20px rgba(52, 208, 248, 0.2)"
      : "none",
  });

  return (
    <div className="app-container">
      <div className="app-content">
        <header className="app-header">
          <div className="logo-container">
            <img
              src="/ownlyfans_logo.png"
              alt="Ownlyfans Logo"
              className="app-logo"
            />
          </div>
          <h1 className="app-title">Ownlyfans PoC</h1>
          <p className="app-subtitle">
            Decentralized content platform with referral rewards
            <br />
            去中心化內容平台，帶有推廣獎勵
          </p>
        </header>

        <div className="connect-button-wrapper">
          <ConnectButton />
        </div>

        {!account ? (
          <div className="empty-state">
            <p>Please connect your wallet to continue</p>
            <p>請連接您的錢包以繼續</p>
          </div>
        ) : (
          <>
            <div className="nav-buttons">
              <button
                onClick={() => setView("creator")}
                style={gradientButtonStyle(view === "creator")}
                onMouseEnter={(e) => {
                  if (view !== "creator") {
                    e.currentTarget.style.background =
                      "rgba(52, 208, 248, 0.1)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (view !== "creator") {
                    e.currentTarget.style.background = "rgba(37, 41, 52, 0.8)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.3)";
                  }
                }}
              >
                Creator Dashboard / 創作者儀表板
              </button>
              <button
                onClick={() => setView("fan")}
                style={gradientButtonStyle(view === "fan")}
                onMouseEnter={(e) => {
                  if (view !== "fan") {
                    e.currentTarget.style.background =
                      "rgba(52, 208, 248, 0.1)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (view !== "fan") {
                    e.currentTarget.style.background = "rgba(37, 41, 52, 0.8)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.3)";
                  }
                }}
              >
                Fan Dashboard / 粉絲儀表板
              </button>
              <button
                onClick={() => setView("revenue")}
                style={gradientButtonStyle(view === "revenue")}
                onMouseEnter={(e) => {
                  if (view !== "revenue") {
                    e.currentTarget.style.background =
                      "rgba(52, 208, 248, 0.1)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (view !== "revenue") {
                    e.currentTarget.style.background = "rgba(37, 41, 52, 0.8)";
                    e.currentTarget.style.borderColor =
                      "rgba(52, 208, 248, 0.3)";
                  }
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
    </div>
  );
}

export default App;
