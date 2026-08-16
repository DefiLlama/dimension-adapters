import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// MAYAChain Midgard, same schema as THORChain. `totalFees` is the day's slip-based
// liquidity (swap) fees paid by users, in CACAO base units (1e10). cacaoPriceUSD is
// that day's CACAO price.
interface IFeeInterval {
  totalFees: string;
  cacaoPriceUSD: string;
  startTime: string;
}

const fetch = async (options: FetchOptions) => {
  const url = `https://midgard.mayachain.info/v2/history/swaps?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  const intervals: IFeeInterval[] = (await httpGet(url, { headers: { "x-client-id": "defillama" } })).intervals;
  const day = intervals.find((i: IFeeInterval) => Number(i.startTime) === options.startOfDay);
  if (!day) {
    throw new Error(`MAYAChain: no Midgard swap interval for startOfDay ${options.startOfDay}`);
  }

  const cacaoPriceUSD = Number(day.cacaoPriceUSD);
  const totalFees = Number(day.totalFees);
  if (!Number.isFinite(cacaoPriceUSD) || !Number.isFinite(totalFees)) {
    throw new Error(
      `MAYAChain: invalid Midgard fee interval (totalFees=${day.totalFees}, cacaoPriceUSD=${day.cacaoPriceUSD})`,
    );
  }
  const swapFees = (totalFees / 1e10) * cacaoPriceUSD;

  // Liquidity fees are paid by the user and accrue to liquidity providers, so the
  // same figure is the user fee and the supply-side revenue.
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(swapFees, "Swap Fees");

  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(swapFees, "Swap Fees");

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(swapFees, "Swap Fees To LPs");

  return { dailyFees, dailyUserFees, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Slip-based liquidity (swap) fees paid by users on MAYAChain's pools, sourced from MAYAChain Midgard and converted from CACAO to USD at that day's CACAO price.",
  UserFees: "Slip-based liquidity (swap) fees paid by users when swapping through MAYAChain.",
  SupplySideRevenue: "All swap fees accrue to MAYAChain liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MAYA],
  start: '2023-03-16', // MAYAChain mainnet launch
  methodology,
};

export default adapter;
