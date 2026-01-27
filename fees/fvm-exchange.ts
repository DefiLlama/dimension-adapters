import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const FACTORY_ADDRESS = "0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A";

type TABI = {
  [k: string]: string;
};
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}

const fetch = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances()
  const lpTokens = await api.fetchList({ lengthAbi: ABIs.allPairsLength, itemAbi: ABIs.allPairs, target: FACTORY_ADDRESS });

  const logs = await getLogs({
    targets: lpTokens,
    eventAbi: "event GaugeFees (address indexed token, uint256 amount, address externalBribe)",
    entireLog: true
  })

  logs.forEach((log: any) => {
    dailyFees.add(log.args.token, log.args.amount)
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: '2023-07-01',
    },
  },
};

export default adapter;
