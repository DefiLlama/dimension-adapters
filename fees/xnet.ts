import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

const REVENUE_URL =
  "https://raw.githubusercontent.com/" +
  "xnet-community-data/xnet-data-integration/main/data/xnet_defillama_revenue.json";

const XIP12_EFFECTIVE_DATE = "2025-05-22";
const SERVICE_REVENUE_SAFE_THROUGH = "2026-07-31";

const OPERATIONS_REVENUE = "Operations";
const PROTOCOL_OWNED_LIQUIDITY = "Protocol-owned liquidity";

interface RevenueRow {
  date: string;
  service_month: string;
  fees_usd: number;
  user_fees_usd: number;
  payment_received_date: string;
}

interface RevenueFeed {
  schema_version: number;
  data: RevenueRow[];
}

const fetch = async (options: FetchOptions) => {
  if (options.dateString > SERVICE_REVENUE_SAFE_THROUGH) {
    return {};
  }

  const response: RevenueFeed = await fetchURL(REVENUE_URL);

  if (!response || !Array.isArray(response.data)) {
    throw new Error("Unexpected XNET revenue feed response");
  }

  const rows = response.data.filter((row) => row.date === options.dateString);

  const toFiniteNumber = (value: unknown, field: string) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Invalid XNET revenue feed value: ${field}`);
    }
    return value;
  };

  const feesUsd = rows.reduce(
    (sum, row) => sum + toFiniteNumber(row.fees_usd, "fees_usd"),
    0,
  );

  const userFeesUsd = rows.reduce(
    (sum, row) => sum + toFiniteNumber(row.user_fees_usd, "user_fees_usd"),
    0,
  );

  const postXip12 = options.dateString >= XIP12_EFFECTIVE_DATE;

  const holdersRevenueUsd = feesUsd * (postXip12 ? 0.6 : 0.8);

  const operationsRevenueUsd = feesUsd * 0.2;

  const liquidityRevenueUsd = postXip12 ? feesUsd * 0.2 : 0;

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (feesUsd > 0) {
    dailyFees.addUSDValue(feesUsd, METRIC.SERVICE_FEES);

    dailyRevenue.addUSDValue(feesUsd, METRIC.SERVICE_FEES);

    dailyHoldersRevenue.addUSDValue(holdersRevenueUsd, METRIC.TOKEN_BUY_BACK);

    dailyProtocolRevenue.addUSDValue(operationsRevenueUsd, OPERATIONS_REVENUE);

    if (liquidityRevenueUsd > 0) {
      dailyProtocolRevenue.addUSDValue(
        liquidityRevenueUsd,
        PROTOCOL_OWNED_LIQUIDITY,
      );
    }
  }

  if (userFeesUsd > 0) {
    dailyUserFees.addUSDValue(userFeesUsd, METRIC.SERVICE_FEES);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,

  // XNET's public source provides monthly service-period accounting,
  // not hourly observations. Daily execution avoids repeating the same
  // monthly accrual in each of the day's 24 hourly windows.
  pullHourly: false,

  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2024-09-30",

  methodology: {
    Fees: "Settlement-confirmed carrier WiFi offload service revenue attributed to the underlying service month and recognized on the final calendar day of that month.",

    Revenue:
      "Settlement-confirmed carrier WiFi offload service revenue retained within the XNET ecosystem. Revenue is allocated between token-holder value accrual and protocol-controlled uses.",

    HoldersRevenue:
      "Historically, 80% of carrier revenue was allocated to XNET market buybacks and burns. Under XIP-12, this was split so that 60% continues to fund XNET buyback-and-burn while 20 percentage points were redirected to protocol-owned liquidity to bolster XNET liquidity.",

    ProtocolRevenue:
      "Historically, 20% of carrier revenue was allocated to operations. Under XIP-12, Protocol Revenue is 40%: 20% for protocol-owned liquidity and 20% for operations. The liquidity allocation remains Protocol Revenue even when part of it is used to acquire XNET for the XNET side of protocol-owned liquidity.",
  },

  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]:
        "Settlement-confirmed carrier WiFi offload service fees reconciled to the underlying service month.",
    },

    Revenue: {
      [METRIC.SERVICE_FEES]:
        "Carrier WiFi offload service revenue retained within the XNET ecosystem.",
    },

    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]:
        "XNET market buyback-and-burn allocation: historically 80% of carrier revenue, changing under XIP-12 to 60% when 20 percentage points were redirected to bolster protocol-owned liquidity.",
    },

    ProtocolRevenue: {
      [OPERATIONS_REVENUE]:
        "20% of carrier revenue allocated to XNET operations in both the historical and XIP-12 regimes.",

      [PROTOCOL_OWNED_LIQUIDITY]:
        "Under XIP-12, 20% of carrier revenue is allocated to protocol-owned liquidity. This allocation was carved out of the historical 80% buyback-and-burn allocation to bolster XNET liquidity.",
    },
  },
};

export default adapter;
