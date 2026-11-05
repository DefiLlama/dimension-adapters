import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Milk Money (https://milk-money.io) runs concentrated-liquidity positions on Meteora DLMM from protocol-owned
// wallets and pays what they earn to $MM stakers or spends it on buybacks. The income statement comes from the
// bot's own ledgers (fee claims, reward deposits, buyback bookings), served by its public staking API:
// https://staking.milk-money.io/api/staking/revenue?from=<unix s>&to=<unix s> (half-open window, ≤ 31 days).
// Source: https://github.com/cryptomilkbeard/creamery/blob/main/src/revenue-history.ts
const API = "https://staking.milk-money.io/api/staking/revenue";

interface RevenueWindow {
  from: number; to: number;
  lpFees: number; gains: number; mining: number; // gross income, USD
  staking: number; mm: number; // to $MM holders, USD
  mmrush: number; mmbtc: number; // kept by the protocol as its other tokens, USD
}

const fetch = async (options: FetchOptions) => {
  let data: RevenueWindow;
  try {
    data = await httpGet(`${API}?from=${options.fromTimestamp}&to=${options.toTimestamp}`);
  } catch (e: any) {
    // the API sits behind Cloudflare: say which edge rule answered, not just the status
    const body = typeof e?.response?.data === "string" ? e.response.data.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) : "";
    throw new Error(`Milk Money revenue API ${e?.response?.status ?? ""} ${e?.message ?? e}${body ? ` · ${body}` : ""}`);
  }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(data.lpFees, "LP Fees");
  dailyFees.addUSDValue(data.gains, "Trading Gains");
  dailyFees.addUSDValue(data.mining, "Mining Rewards");

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(data.staking, "Staking Rewards");
  dailyHoldersRevenue.addUSDValue(data.mm, "MM Buybacks");

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(data.mmrush, "MMRUSH Buybacks");
  dailyProtocolRevenue.addUSDValue(data.mmbtc, "MMBTC Buybacks");

  return {
    dailyFees,
    // the liquidity is the protocol's own: no outside LPs or depositors take a cut
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Everything the protocol's own capital earned: LP fees claimed from its Meteora DLMM positions, the half of each trading agent's realized gain that is committed to stakers or buybacks, and the Sat Rush mining rewards its MMRUSH stake leg earns. Valued in USD when booked.",
  Revenue: "Equal to fees: the liquidity is protocol-owned, so there is no supply side.",
  HoldersRevenue: "Rewards actually deposited into the $MM staking pool (claimable by stakers pro rata) plus $MM bought back with harvested fees. Deposits land a little after the fees that funded them.",
  ProtocolRevenue: "Fees spent buying the protocol's other tokens (MMRUSH, MMBTC), which stay in its treasury vaults.",
};

const breakdownMethodology = {
  Fees: {
    "LP Fees": "Swap fees claimed from the protocol's Meteora DLMM positions.",
    "Trading Gains": "The half of a trading agent's realized gain that it sends to the rewards vault or commits to buybacks.",
    "Mining Rewards": "cbBTC earned by staking RUSH in Sat Rush, paid to $MM stakers.",
  },
  HoldersRevenue: {
    "Staking Rewards": "Reward tokens deposited into the $MM staking pool.",
    "MM Buybacks": "$MM bought with harvested fees and realized gains.",
  },
  ProtocolRevenue: {
    "MMRUSH Buybacks": "MMRUSH bought with the core vault's fees, held by the vault.",
    "MMBTC Buybacks": "MMBTC bought with harvested fees, held by the vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // the API answers any window; the ledgers behind it are booked per transaction
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  // the day after the core vault took over the previous position: that takeover booked one day of inherited
  // gains as a buyback and is not recurring income
  start: "2026-09-25",
  methodology,
  breakdownMethodology,
};

export default adapter;
