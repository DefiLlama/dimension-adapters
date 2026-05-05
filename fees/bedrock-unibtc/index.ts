import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

type ChainConfig = {
  start: string;
  redeemRouter: string;
};

type BedrockBalances = {
  dailyFees: Balances;
  dailyUserFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
};

const ZERO = 0n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UNIBTC_DELAYED_REDEEM_CREATED_EVENT = "event DelayedRedeemCreated(address recipient, address token, uint256 amount, uint256 index, uint256 redeemFee)";

const METRICS = {
  UNIBTC_REDEMPTION_FEES: "uniBTC Redemption Fees",
  UNIBTC_REDEMPTION_FEES_TO_PROTOCOL: "uniBTC Redemption Fees To Protocol",
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2024-11-20",
    redeemRouter: "0xAA732c9c110A84d090a72da230eAe1E779f89246",
  },
  [CHAIN.BASE]: {
    start: "2025-08-09",
    redeemRouter: "0xBB45B3a09BFfC15747D1a331775Fa408e587f38d",
  },
  [CHAIN.MERLIN]: {
    start: "2025-05-13",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
  [CHAIN.BITLAYER]: {
    start: "2025-03-06",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
  [CHAIN.ZETA]: {
    start: "2025-04-25",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
};

async function fetch(options: FetchOptions) {
  const balances: BedrockBalances = {
    dailyFees: options.createBalances(),
    dailyUserFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
  };
  const config = chainConfig[options.chain];

  const logs = await options.getLogs({
    target: config.redeemRouter,
    eventAbi: UNIBTC_DELAYED_REDEEM_CREATED_EVENT,
  });

  for (const log of logs) {
    const redeemFee = BigInt(log.redeemFee);
    if (redeemFee <= ZERO) continue;
    if (!log.token || log.token === ZERO_ADDRESS) continue;

    balances.dailyFees.add(log.token, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES);
    balances.dailyUserFees.add(log.token, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES);
    balances.dailyRevenue.add(log.token, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL);
    balances.dailyProtocolRevenue.add(log.token, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL);
  }

  return balances;
}

const adapter: Adapter = {
  version: 2,
  pullHourly: false,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "uniBTC redeemFee amounts emitted by Bedrock redeem routers when delayed redemption requests are created.",
    UserFees: "uniBTC redemption fees paid by users when delayed redemption requests are created.",
    Revenue: "uniBTC redemption fees retained by Bedrock.",
    ProtocolRevenue: "uniBTC redemption fees retained by Bedrock.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.UNIBTC_REDEMPTION_FEES]: "uniBTC redeemFee emitted when delayed redemption requests are created.",
    },
    UserFees: {
      [METRICS.UNIBTC_REDEMPTION_FEES]: "uniBTC redemption fees paid by users when delayed redemption requests are created.",
    },
    Revenue: {
      [METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL]: "uniBTC redemption fees retained by Bedrock.",
    },
    ProtocolRevenue: {
      [METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL]: "uniBTC redemption fees retained by Bedrock.",
    },
  },
};

export default adapter;
