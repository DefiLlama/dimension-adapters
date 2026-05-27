/**
 * Markit (Base) — LP-underwritten prediction markets.
 *
 * Factory deploys standalone MarketEngine contracts per market. LpVault aggregates LP capital and
 * allocates it across markets. No AMM / order book; users buy sides and hold until resolution or
 * hedge by buying the opposite side (no sell).
 *
 * MarketCreated(address indexed engine, string question, uint256 bettingCloseTime, uint256 resolveTime)
 * BetPlaced(address indexed user, uint8 side, uint256 usdcIn, uint256 fee, uint256 protocolFee,
 *           uint256 sharesOut, uint256 markPrice)
 *
 * Fee structure: 2% protocolFee + dynamic LP fee (~1% base ± skew adjustment).
 */

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const MARKIT_FACTORY = "0xB86d5c873daaD15817b424f6d55d7641DAbb00E9";
const FACTORY_START_BLOCK = 42886013;

const EVENT_MARKET_CREATED =
  "event MarketCreated(address indexed engine, string question, uint256 bettingCloseTime, uint256 resolveTime)";
const EVENT_BET_PLACED =
  "event BetPlaced(address indexed user, uint8 side, uint256 usdcIn, uint256 fee, uint256 protocolFee, uint256 sharesOut, uint256 markPrice)";

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;

  const marketCreatedLogs = await getLogs({
    target: MARKIT_FACTORY,
    eventAbi: EVENT_MARKET_CREATED,
    fromBlock: FACTORY_START_BLOCK,
    cacheInCloud: true,
  });

  const engines: string[] = marketCreatedLogs.map((l: any) => l.engine.toLowerCase());

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  if (!engines.length) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyProtocolRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
  }

  const betLogs = await getLogs({
    targets: engines,
    eventAbi: EVENT_BET_PLACED,
    flatten: true,
  });

  for (const log of betLogs) {
    const usdc = Number(log.usdcIn) / 1e6;
    const lp = Number(log.fee) / 1e6;
    const protocol = Number(log.protocolFee) / 1e6;

    dailyVolume.addUSDValue(usdc);
    dailyFees.addUSDValue(lp, METRIC.LP_FEES);
    dailyFees.addUSDValue(protocol, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addUSDValue(lp, METRIC.LP_FEES);
    dailyProtocolRevenue.addUSDValue(protocol, METRIC.PROTOCOL_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-03-03",
  methodology: {
    Fees: "LP fee ~1% base ± skew, protocol fee 2%) from each BetPlaced event.",
    Revenue: "2% trading fees collected on every bet.",
    SupplySideRevenue: "Dynamic LP fee ~1% base ± skew adjustment of the fees",
    ProtocolRevenue: "2% trading fees collected on every bet.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.LP_FEES]: "Dynamic LP fee ~1% base ± skew adjustment of the fees",
      [METRIC.PROTOCOL_FEES]: "2% trading fees collected on every bet.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "2% trading fees collected on every bet.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Dynamic LP fee ~1% base ± skew adjustment of the fees",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "2% trading fees collected on every bet.",
    },
  },
};

export default adapter;
