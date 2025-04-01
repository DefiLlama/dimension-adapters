import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const USDC = ADDRESSES.base.USDC;

const registry = "0xFF11a76cB422642525B751972151841673CB0C57";

const poolAbi = {
  activePools: "function activePools() view returns (address[])",
};

const interestAccruedABI =
  "event InterestAccrued(address indexed caller, uint256 interest, uint256 totalDebt, uint256 totalAssets)";

const reserveFactorABI = "function reserveFactor() view returns (uint256)";

const getAndSumFees = async (
  options: FetchOptions,
  targets: string[]
): Promise<bigint> => {
  try {
    const logs = await options.getLogs({
      targets,
      eventAbi: interestAccruedABI,
      flatten: true,
    });

    const parsedFees = logs.reduce((acc, log: any) => {
      try {
        const interestRaw = log.args ? log.args[1] : log[1];

        if (interestRaw) {
          return acc + BigInt(interestRaw);
        }
      } catch (parseError) {
        console.log("Parse attempt failed:", parseError);
      }
      return acc;
    }, BigInt(0));

    return parsedFees;
  } catch (error) {
    console.error("Error>>>", error);
    return BigInt(0);
  }
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const targets = await options.api.call({
    target: registry,
    abi: poolAbi.activePools,
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  let totalRevenue = BigInt(0);

  const reserveFactors = await options.api.multiCall({
    abi: reserveFactorABI,
    calls: targets,
  });

  for (let i = 0; i < targets.length; i++) {
    const poolAddress = targets[i];
    const reserveFactor = BigInt(reserveFactors[i]);

    const fees = await getAndSumFees(options, [poolAddress]);

    const revenue = (fees * reserveFactor) / BigInt(1e18);
    totalRevenue += revenue;
  }

  const cheddaFees = await getAndSumFees(options, targets);

  dailyFees.add(USDC, cheddaFees);
  dailyRevenue.add(USDC, totalRevenue);

  return { dailyFees, dailyRevenue: dailyRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-02-28",
      meta: {
        methodology: {
          Fees: "Interest accrued from lending pools, collected as fees.",
          Revenue:
            "Portion of interest from lending pools, based on reserve factor.",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
