import { useState, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { getPurchaseEvents } from "../utils/contract";
import { suiClient } from "../utils/suiClient";

interface RevenueStats {
  totalClicks: number;
  totalPurchases: number;
  totalRevenue: bigint;
  referralEarnings: bigint;
  conversionRate: number;
}

export default function RevenueDashboard() {
  const account = useCurrentAccount();
  const [stats, setStats] = useState<RevenueStats>({
    totalClicks: 0,
    totalPurchases: 0,
    totalRevenue: BigInt(0),
    referralEarnings: BigInt(0),
    conversionRate: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseEvents, setPurchaseEvents] = useState<any[]>([]);

  useEffect(() => {
    if (account) {
      loadRevenueData();
    }
  }, [account]);

  const loadRevenueData = async () => {
    if (!account) return;

    setLoading(true);
    setError(null);

    try {
      // Query purchase events where this address is the referral
      // 查詢此地址作為推廣者的購買事件
      const events = await getPurchaseEvents();

      // Filter events where referral_address matches current account
      // 過濾推廣地址匹配當前賬戶的事件
      const myReferralEvents = events.filter((event: any) => {
        const parsedJson = event.parsedJson;
        return parsedJson?.referral_address === account.address;
      });

      // Calculate statistics
      // 計算統計數據
      let totalRevenue = BigInt(0);
      let referralEarnings = BigInt(0);

      myReferralEvents.forEach((event: any) => {
        const parsedJson = event.parsedJson;
        if (parsedJson) {
          totalRevenue += BigInt(parsedJson.amount || 0);
          referralEarnings += BigInt(parsedJson.referral_share || 0);
        }
      });

      // For PoC, we'll estimate clicks (in production, track separately)
      // 對於 PoC，我們將估算點擊數（在生產環境中，單獨追蹤）
      const estimatedClicks = myReferralEvents.length * 10; // Assume 10% conversion
      const conversionRate =
        myReferralEvents.length > 0
          ? (myReferralEvents.length / estimatedClicks) * 100
          : 0;

      setStats({
        totalClicks: estimatedClicks,
        totalPurchases: myReferralEvents.length,
        totalRevenue,
        referralEarnings,
        conversionRate,
      });

      setPurchaseEvents(myReferralEvents);
    } catch (err) {
      console.error("Error loading revenue data:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load revenue data / 載入收益數據失敗"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <p>Please connect your wallet to view revenue statistics</p>
        <p style={{ color: "#666" }}>請連接您的錢包以查看收益統計</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Revenue Dashboard / 收益儀表板</h2>

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={loadRevenueData}
          disabled={loading}
          style={{
            padding: "10px 20px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading... / 載入中..." : "Refresh Stats / 刷新統計"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px",
            background: "#ffebee",
            borderRadius: "4px",
            color: "#c62828",
            marginBottom: "20px",
          }}
        >
          <strong>Error / 錯誤:</strong> {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          style={{
            padding: "20px",
            background: "#e3f2fd",
            borderRadius: "8px",
            border: "1px solid #90caf9",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", color: "#1976d2" }}>
            Total Clicks / 總點擊數
          </h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>
            {stats.totalClicks}
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            background: "#e8f5e9",
            borderRadius: "8px",
            border: "1px solid #81c784",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", color: "#388e3c" }}>
            Total Purchases / 總購買數
          </h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>
            {stats.totalPurchases}
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            background: "#fff3e0",
            borderRadius: "8px",
            border: "1px solid #ffb74d",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", color: "#f57c00" }}>
            Conversion Rate / 轉換率
          </h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>
            {stats.conversionRate.toFixed(2)}%
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            background: "#f3e5f5",
            borderRadius: "8px",
            border: "1px solid #ba68c8",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", color: "#7b1fa2" }}>
            Referral Earnings / 推廣收益
          </h3>
          <p style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>
            {Number(stats.referralEarnings) / 1e9} SUI
          </p>
        </div>
      </div>

      {/* Purchase Events List */}
      {purchaseEvents.length > 0 && (
        <div
          style={{
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <h3>Recent Purchases / 最近購買</h3>
          {purchaseEvents.slice(0, 10).map((event: any, index: number) => {
            const parsedJson = event.parsedJson;
            return (
              <div
                key={index}
                style={{
                  padding: "15px",
                  marginBottom: "10px",
                  background: "#f5f5f5",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>
                  Purchase #{index + 1}
                </p>
                <p style={{ margin: "0", fontSize: "0.9em", color: "#666" }}>
                  Buyer: <code>{parsedJson?.buyer || "N/A"}</code>
                  <br />
                  Amount:{" "}
                  {parsedJson?.amount ? Number(parsedJson.amount) / 1e9 : 0} SUI
                  <br />
                  Your Share:{" "}
                  {parsedJson?.referral_share
                    ? Number(parsedJson.referral_share) / 1e9
                    : 0}{" "}
                  SUI
                  <br />
                  Transaction:{" "}
                  <code style={{ fontSize: "0.8em" }}>{event.id.txDigest}</code>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {purchaseEvents.length === 0 && !loading && (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            background: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          <p>
            No referral purchases yet. Share your referral link to start
            earning!
          </p>
          <p style={{ color: "#666" }}>
            尚無推廣購買。分享您的推廣連結開始賺取收益！
          </p>
        </div>
      )}
    </div>
  );
}
