/**
 * Jink (jink.fun) — Fees & Revenue Adapter for DefiLlama
 *
 * Repo: DefiLlama/dimension-adapters  →  fees/jink/index.ts
 *
 * Fee structure:
 *   - Trade fee = 0.1% of notional (min $1 USDT) on open AND close
 *   - 80% → market opener (creator revenue, claimable)
 *   - 20% → platform (protocol revenue)
 *
 * dailyFees     = total fees collected (open fees + close fees)
 * dailyRevenue  = platform's 20% cut
 * dailySupplySideRevenue = opener's 80% cut
 */

import { SimpleAdapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// ── Deployed contracts (BSC mainnet) ─────────────────────────────
const FACTORY = "0x56C933DbBE553a271b9b0b1638aA21a618125E1d";
const FACTORY_DEPLOY_BLOCK = 48000000; // adjust to actual deploy block

// ── Event ABIs ───────────────────────────────────────────────────
const MARKET_CREATED_ABI =
  "event MarketCreated(address indexed token, address indexed opener, address vault, address perps, address botWallet)";

const POSITION_OPENED_ABI =
  "event PositionOpened(uint256 indexed id, address indexed trader, bool isLong, uint256 margin, uint8 leverage, uint256 entryPrice, uint256 fee, uint8 marginMode)";

const POSITION_CLOSED_ABI =
  "event PositionClosed(uint256 indexed id, address indexed trader, int256 pnl, uint256 exitPrice, uint256 fee)";

/**
 * Discover all perps contract addresses from Factory events.
 */
async function getPerpsContracts(api: any): Promise<string[]> {
  const logs = await api.getLogs({
    target: FACTORY,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    eventAbi: MARKET_CREATED_ABI,
  });
  return logs.map((l: any) => l.args.perps || l.perps);
}

const fetch = async (timestamp: number, _: any, options: any): Promise<FetchResultFees> => {
  const { api, fromBlock, toBlock } = options;

  const perpsAddresses = await getPerpsContracts(api);

  if (perpsAddresses.length === 0) {
    return {
      dailyFees: "0",
      dailyRevenue: "0",
      dailySupplySideRevenue: "0",
      dailyUserFees: "0",
      timestamp,
    };
  }

  let totalFees = 0n;

  for (const perps of perpsAddresses) {
    // ── Open fees ──
    const openedLogs = await api.getLogs({
      target: perps,
      fromBlock,
      toBlock,
      eventAbi: POSITION_OPENED_ABI,
    });

    for (const log of openedLogs) {
      totalFees += BigInt(log.args.fee || log.fee);
    }

    // ── Close fees ──
    const closedLogs = await api.getLogs({
      target: perps,
      fromBlock,
      toBlock,
      eventAbi: POSITION_CLOSED_ABI,
    });

    for (const log of closedLogs) {
      totalFees += BigInt(log.args.fee || log.fee);
    }
  }

  // Convert from 18 decimals to USD
  const dailyFeesUsd = Number(totalFees) / 1e18;
  const dailyRevenueUsd = dailyFeesUsd * 0.2;          // 20% platform
  const dailySupplySideUsd = dailyFeesUsd * 0.8;       // 80% market openers

  return {
    dailyFees: dailyFeesUsd.toString(),
    dailyUserFees: dailyFeesUsd.toString(),
    dailyRevenue: dailyRevenueUsd.toString(),
    dailySupplySideRevenue: dailySupplySideUsd.toString(),
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1735689600, // adjust to first trade unix timestamp
      meta: {
        methodology: {
          Fees: "0.1% of notional trade size (minimum $1 USDT) charged on both open and close of perpetual positions.",
          Revenue: "20% of all trading fees go to the Jink platform.",
          SupplySideRevenue: "80% of all trading fees go to the market creator (opener) who deployed the perps market.",
        },
      },
    },
  },
};

export default adapter;
