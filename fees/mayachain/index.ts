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

// CACAO has 10 decimals (1e10 base units), unlike THORChain's RUNE which has 8.
// https://docs.mayaprotocol.com/mayachain-dev-docs/introduction/technology/native-assets
const CACAO_BASE_UNIT = 1e10;

// Parse a required Midgard numeric field. Reject empty/missing values explicitly:
// Number("") and Number(null) both coerce to a finite 0, which would silently
// publish a false zero instead of failing closed.
const requireFinite = (raw: string, field: string): number => {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`MAYAChain: missing Midgard field ${field}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`MAYAChain: non-numeric Midgard field ${field}=${raw}`);
  }
  return value;
};

const fetch = async (options: FetchOptions) => {
  const url = `https://midgard.mayachain.info/v2/history/swaps?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  const intervals: IFeeInterval[] = (await httpGet(url, { headers: { "x-client-id": "defillama" } })).intervals;
  const day = intervals.find((i: IFeeInterval) => Number(i.startTime) === options.startOfDay);
  if (!day) {
    throw new Error(`MAYAChain: no Midgard swap interval for startOfDay ${options.startOfDay}`);
  }

  const cacaoPriceUSD = requireFinite(day.cacaoPriceUSD, "cacaoPriceUSD");
  const totalFees = requireFinite(day.totalFees, "totalFees");
  const swapFees = (totalFees / CACAO_BASE_UNIT) * cacaoPriceUSD;

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
