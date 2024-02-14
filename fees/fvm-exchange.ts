import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const FACTORY_ADDRESS = "0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A";

type TABI = {
  [k: string]: string;
};
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, api }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const lpTokens = await api.fetchList({ lengthAbi: ABIs.allPairsLength, itemAbi: ABIs.allPairs, target: FACTORY_ADDRESS });

  (await getLogs({
    targets: lpTokens,
    eventAbi: "event GaugeFees (address indexed token, uint256 amount, address externalBribe)",
  })).map((e: any) => dailyFees.add(e.token, e.amount))

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: 1688172646,
    },
  },
};

export default adapter;
