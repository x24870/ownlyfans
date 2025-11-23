import { useState, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { getPurchaseEvents } from "../utils/contract";

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
      <div className="empty-state">
        <p>Please connect your wallet to view revenue statistics</p>
        <p>請連接您的錢包以查看收益統計</p>
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          color: "#FFFFFF",
          fontSize: "2em",
          fontWeight: "700",
          letterSpacing: "-0.02em",
          marginBottom: "30px",
        }}
      >
        Revenue Dashboard / 收益儀表板
      </h2>

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={loadRevenueData}
          disabled={loading}
          className="gradient-button"
          style={{ padding: "12px 24px", fontSize: "1em" }}
        >
          {loading ? "Loading... / 載入中..." : "Refresh Stats / 刷新統計"}
        </button>
      </div>

      {error && (
        <div
          className="glass-card"
          style={{
            marginBottom: "20px",
            borderColor: "rgba(255, 0, 128, 0.4)",
            background: "rgba(255, 0, 128, 0.1)",
          }}
        >
          <strong style={{ color: "#FF0080" }}>Error / 錯誤:</strong>{" "}
          <span style={{ color: "#FFFFFF" }}>{error}</span>
        </div>
      )}

      {/* Statistics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div className="glass-card">
          <h3
            style={{
              margin: "0 0 15px 0",
              color: "#FFFFFF",
              fontSize: "1.1em",
              fontWeight: "600",
            }}
          >
            Total Purchases / 總購買數
          </h3>
          <p
            className="data-highlight"
            style={{ fontSize: "2.5em", fontWeight: "700", margin: 0 }}
          >
            {stats.totalPurchases}
          </p>
        </div>

        <div className="glass-card">
          <h3
            style={{
              margin: "0 0 15px 0",
              color: "#FFFFFF",
              fontSize: "1.1em",
              fontWeight: "600",
            }}
          >
            Referral Earnings / 推廣收益
          </h3>
          <p
            className="data-highlight"
            style={{ fontSize: "2.5em", fontWeight: "700", margin: 0 }}
          >
            {Number(stats.referralEarnings) / 1e9} SUI
          </p>
        </div>
      </div>

      {/* Purchase Events List */}
      {purchaseEvents.length > 0 && (
        <div className="glass-card">
          <h3
            style={{
              color: "#FFFFFF",
              marginTop: "0",
              marginBottom: "20px",
              fontSize: "1.5em",
              fontWeight: "700",
            }}
          >
            Recent Purchases / 最近購買
          </h3>
          {purchaseEvents.slice(0, 10).map((event: any, index: number) => {
            const parsedJson = event.parsedJson;
            return (
              <div
                key={index}
                style={{
                  padding: "20px",
                  marginBottom: "15px",
                  background: "rgba(37, 41, 52, 0.6)",
                  borderRadius: "12px",
                  border: "1px solid rgba(52, 208, 248, 0.2)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 12px 0",
                    fontWeight: "600",
                    color: "#FFFFFF",
                    fontSize: "1.1em",
                  }}
                >
                  Purchase #{index + 1}
                </p>
                <p
                  style={{ margin: "0", fontSize: "0.95em", color: "#D0D0D0" }}
                >
                  Buyer:{" "}
                  <code
                    className="monospace"
                    style={{ color: "#00E0FF", wordBreak: "break-all" }}
                  >
                    {parsedJson?.buyer || "N/A"}
                  </code>
                  <br />
                  Amount:{" "}
                  <span className="data-highlight">
                    {parsedJson?.amount ? Number(parsedJson.amount) / 1e9 : 0}{" "}
                    SUI
                  </span>
                  <br />
                  Your Share:{" "}
                  <span className="data-highlight">
                    {parsedJson?.referral_share
                      ? Number(parsedJson.referral_share) / 1e9
                      : 0}{" "}
                    SUI
                  </span>
                  <br />
                  Transaction:{" "}
                  <code
                    className="monospace"
                    style={{
                      fontSize: "0.85em",
                      color: "#00E0FF",
                      wordBreak: "break-all",
                    }}
                  >
                    {event.id.txDigest}
                  </code>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {purchaseEvents.length === 0 && !loading && (
        <div className="glass-card" style={{ textAlign: "center" }}>
          <p
            style={{
              color: "#FFFFFF",
              fontSize: "1.1em",
              marginBottom: "10px",
            }}
          >
            No referral purchases yet. Share your referral link to start
            earning!
          </p>
          <p style={{ color: "#D0D0D0" }}>
            尚無推廣購買。分享您的推廣連結開始賺取收益！
          </p>
        </div>
      )}
    </div>
  );
}
