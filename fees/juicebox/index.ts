import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  const logsFees = await options.getLogs({
    target: "0xf4BF4D5a5631d29Bd0B7A33a0a1870bcC4529f03",
    eventAbi: "event BuybackDelegate_Swap(uint256 indexed projectId, uint256 amountIn, address pool, uint256 amountOut, address caller)"
  });
  logsFees.forEach(log => {
    dailyFees.add(ADDRESSES.null, log.amountIn)
  })

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "2.5% of money raised in juicebox goes to buyback JBX upon withdrawal (money sent from one juicebox to another is not counted)",
    Revenue: "All fees on Juicebox are revenue.",
    HoldersRevenue: "All fees on Juicebox are distributed to holders.",
  },
};

export default adapter;
