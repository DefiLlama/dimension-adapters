/**
 * Jink (jink.fun) — Volume Adapter for DefiLlama
 *
 * Repo: DefiLlama/dimension-adapters  →  dexs/jink/index.ts
 *
 * Daily volume = sum of notional size (margin × leverage) from
 * PositionOpened + PositionClosed events across all JinkPerps contracts.
 */

import {
  FetchResultVolume,
  SimpleAdapter,
} from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

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

const LIMIT_ORDER_FILLED_ABI =
  "event LimitOrderFilled(uint256 indexed orderId, uint256 indexed positionId, uint256 fillPrice)";

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

const fetch = async (timestamp: number, _: any, options: any): Promise<FetchResultVolume> => {
  const { api, fromBlock, toBlock } = options;

  const perpsAddresses = await getPerpsContracts(api);

  if (perpsAddresses.length === 0) {
    return { dailyVolume: "0", timestamp };
  }

  let dailyVolume = 0n;

  // ── PositionOpened: volume = margin × leverage (18 decimals USDT) ──
  for (const perps of perpsAddresses) {
    const openedLogs = await api.getLogs({
      target: perps,
      fromBlock,
      toBlock,
      eventAbi: POSITION_OPENED_ABI,
    });

    for (const log of openedLogs) {
      const margin = BigInt(log.args.margin || log.margin);
      const leverage = BigInt(log.args.leverage || log.leverage);
      dailyVolume += margin * leverage;
    }

    // ── PositionClosed: fee × 1000 to reverse the 0.1% fee → notional ──
    const closedLogs = await api.getLogs({
      target: perps,
      fromBlock,
      toBlock,
      eventAbi: POSITION_CLOSED_ABI,
    });

    for (const log of closedLogs) {
      const fee = BigInt(log.args.fee || log.fee);
      // fee = max(notional * 0.001, 1 USDT), so notional ≈ fee / 0.001
      // but we use fee * 1000 as approximation (slightly over-counts $1 min fees)
      dailyVolume += fee * 1000n;
    }
  }

  // Convert from 18 decimals to USD string
  const dailyVolumeUsd = Number(dailyVolume) / 1e18;

  return {
    dailyVolume: dailyVolumeUsd.toString(),
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1776555678, // adjust to first trade unix timestamp
    },
  },
};

export default adapter;
