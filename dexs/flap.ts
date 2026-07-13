import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BONDING_CURVE_FEES = "Bonding Curve Fees";

// Source: https://docs.flap.sh/flap/developers/deployed-contract-addresses
const chainConfig: Record<string, { start: string; portal: string }> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-08",
    portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
  },
  [CHAIN.XLAYER]: {
    start: "2025-08-18",
    portal: "0xb30D8c4216E1f21F27444D2FfAee3ad577808678",
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { portal } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const buyLogs = await options.getLogs({ target: portal, eventAbi: eventAbis.tokenBought });
  const sellLogs = await options.getLogs({ target: portal, eventAbi: eventAbis.tokenSold });
  const logs = [...buyLogs, ...sellLogs];
  if (!logs.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue };

  logs.forEach((log) => {
    dailyVolume.addGasToken(log.eth);
    dailyFees.addGasToken(log.fee, BONDING_CURVE_FEES);
    dailyRevenue.addGasToken(log.fee, BONDING_CURVE_FEES);
    dailyProtocolRevenue.addGasToken(log.fee, BONDING_CURVE_FEES);
  });

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Buy and sell volume on Flap bonding curves before tokens move to a DEX.",
  Fees: "Fees users pay on Flap bonding-curve buys and sells. Token taxes are excluded.",
  UserFees: "Fees users pay on Flap bonding-curve buys and sells.",
  Revenue: "Fees kept by Flap from bonding-curve trades.",
  ProtocolRevenue: "Fees kept by Flap from bonding-curve trades.",
};

const breakdownMethodology = {
  Fees: {
    [BONDING_CURVE_FEES]: "Fees users pay on Flap bonding-curve buys and sells.",
  },
  UserFees: {
    [BONDING_CURVE_FEES]: "Fees users pay on Flap bonding-curve buys and sells.",
  },
  Revenue: {
    [BONDING_CURVE_FEES]: "Fees kept by Flap from bonding-curve trades.",
  },
  ProtocolRevenue: {
    [BONDING_CURVE_FEES]: "Fees kept by Flap from bonding-curve trades.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
