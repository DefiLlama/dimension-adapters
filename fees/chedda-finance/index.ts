import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const USDC = ADDRESSES.base.USDC;

const cheddaPools = [
  "0xE5c35103D75a72035B7B21Bb8e3Fd1e06920e5b0",
  "0x7677DcdaCE362b4185dB2eE47472108156397936",
];

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
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  let totalRevenue = BigInt(0);

  const reserveFactors = await options.api.multiCall({
    abi: reserveFactorABI,
    calls: cheddaPools,
  });

  for (let i = 0; i < cheddaPools.length; i++) {
    const poolAddress = cheddaPools[i];
    const reserveFactor = BigInt(reserveFactors[i]);

    const fees = await getAndSumFees(options, [poolAddress]);

    const revenue = (fees * reserveFactor) / BigInt(1e18);
    totalRevenue += revenue;
  }

  const cheddaFees = await getAndSumFees(options, cheddaPools);

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
