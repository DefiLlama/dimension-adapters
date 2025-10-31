import { CHAIN } from "../helpers/chains";
import type {
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../adapters/types";

const contracts: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "0x40d5ff3e218f54f4982661a0464a298cf6652351",
};
const fetch = async (
  timestamp: number,
  _1: any,
  options: FetchOptions
): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const logs = await options.getLogs({
    target: contracts[options.chain],
    eventAbi:
      "event RewardsProcessed(uint256 totalRewards,uint256 elRewards,uint256 clRewards,uint256 netRewards,uint256 fees)",
  });

  logs.forEach((log) => {
    dailyFees.addGasToken(log.fees + log.netRewards);
    dailyRevenue.addGasToken(log.fees);
    dailySupplySideRevenue.addGasToken(log.netRewards);
  });

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: "2020-12-19",
    },
  },
  methodology: {
    Fees: 'All yield generated from staking assets.',
    Revenue: 'Amount of fees collected by YieldNest.',
    ProtocolRevenue: 'Amount of fees collected by YieldNest.',
    SupplySideRevenue: 'Amount of fees distributed to asset stakers.',
  }
};

export default adapter;
