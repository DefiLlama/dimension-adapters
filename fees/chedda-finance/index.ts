import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const registry = "0xFF11a76cB422642525B751972151841673CB0C57";
const interestAccruedABI = "event InterestAccrued(address indexed caller, uint256 interest, uint256 totalDebt, uint256 totalAssets)";


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const lendingPools = await options.api.call({ target: registry, abi: 'address[]:activePools', });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();


  const reserveFactors = await options.api.multiCall({ abi: 'uint256:reserveFactor', calls: lendingPools, });
  const tokens = await options.api.multiCall({ abi: 'address:poolAsset', calls: lendingPools, });
  const logsAll = await options.getLogs({ eventAbi: interestAccruedABI, flatten: false, targets: lendingPools, });

  logsAll.forEach((logs: any, idx: number) => {
    const token = tokens[idx]
    const reserveFactor = reserveFactors[idx] / 1e18
    const revenue = logs.map((i: any) => i.interest.toString() * reserveFactor)
    const fees = logs.map((i: any) => i.interest.toString())
    dailyFees.add(token, fees)
    dailyRevenue.add(token, revenue)
  })

  return { dailyFees, dailyRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-02-28",
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Interest accrued from lending pools, collected as fees.",
    Revenue:
      "Portion of interest from lending pools, based on reserve factor.",
  },
};

export default adapter;
