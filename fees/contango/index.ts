import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  const rawFees = await addTokensReceived({
    options,
    target: "0xFee97c6f9Bce786A08b1252eAc9223057508c760",
    fromAdddesses: ["0x3F37C7d8e61C000085AAc0515775b06A3412F36b"],
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(rawFees, METRIC.TRADING_FEES);

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addBalances(rawFees, "Staking Rewards");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Trading fees include 0.05% for correlated pairs and 0.25% for non-correlated pairs, plus automation fees for TP/SL orders and flash loan fees.",
  Revenue: "Revenue consists of the service fees collected from trades on both correlated and non-correlated pairs.",
  ProtocolRevenue: "Protocol revenue is 0 as all fees go to stakers.",
  HoldersRevenue: "Holders revenue represents 100% of the trading fees which are distributed to stakers.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Trading fees from perpetual positions (0.05% for correlated pairs, 0.25% for non-correlated pairs), automation fees for take-profit/stop-loss orders, and flash loan fees',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'Trading fees from perpetual positions (0.05% for correlated pairs, 0.25% for non-correlated pairs), automation fees for take-profit/stop-loss orders, and flash loan fees',
  },
  HoldersRevenue: {
    "Staking Rewards": '100% of trading fees distributed to token stakers',
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.SCROLL, CHAIN.XDAI, CHAIN.AVAX, CHAIN.LINEA, CHAIN.POLYGON, CHAIN.BSC],
  fetch,
  start: "2024-11-05",
  methodology,
  breakdownMethodology,
};

export default adapter;
