import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// MAYAChain Midgard, same schema as THORChain. Volumes and fees are in CACAO
// base units (1e10). cacaoPriceUSD is that day's CACAO price.
interface ISwapInterval {
  totalVolume: string;
  totalFees: string;
  cacaoPriceUSD: string;
  startTime: string;
}

// CACAO has 10 decimals (1e10 base units), unlike THORChain's RUNE which has 8.
// https://docs.mayaprotocol.com/mayachain-dev-docs/introduction/technology/native-assets
const CACAO_BASE_UNIT = 1e10;

//https://docs.mayaprotocol.com/#tokenomics-structure
const HOLDERS_SHARE_PERCENT = 0.1;

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

const cacaoToUsd = (amount: string, cacaoPriceUSD: number, field: string): number =>
  (requireFinite(amount, field) / CACAO_BASE_UNIT) * cacaoPriceUSD;

const fetch = async (options: FetchOptions) => {
  const url = `https://midgard.mayachain.info/v2/history/swaps?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  const intervals: ISwapInterval[] = (await httpGet(url, { headers: { "x-client-id": "defillama" } })).intervals;
  const day = intervals.find((i: ISwapInterval) => Number(i.startTime) === options.startOfDay);
  if (!day) {
    throw new Error(`MAYAChain: no Midgard swap interval for startOfDay ${options.startOfDay}`);
  }

  const cacaoPriceUSD = requireFinite(day.cacaoPriceUSD, "cacaoPriceUSD");
  const dailyVolume = cacaoToUsd(day.totalVolume, cacaoPriceUSD, "totalVolume");
  const swapFees = cacaoToUsd(day.totalFees, cacaoPriceUSD, "totalFees");

  // Liquidity fees are paid by the user and accrue to liquidity providers, so the
  // same figure is the user fee and the supply-side revenue.
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(swapFees, "Swap Fees");

  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(swapFees, "Swap Fees");

  const swapFeesToHolders = swapFees * HOLDERS_SHARE_PERCENT;
  const swapFeesToLps = swapFees - swapFeesToHolders;

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(swapFeesToHolders, "Swap Fees To $MAYA Holders");

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(swapFeesToLps, "Swap Fees To LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total USD value of swaps executed through MAYAChain's liquidity pools, sourced from MAYAChain Midgard. Every swap routes through native CACAO and settles on the MAYAChain L1, so volume is reported on the MAYAChain chain. Daily CACAO-denominated swap volume is converted to USD using that day's CACAO price.",
  Fees: "Slip-based liquidity (swap) fees paid by users on MAYAChain's pools, sourced from MAYAChain Midgard and converted from CACAO to USD at that day's CACAO price.",
  UserFees: "Slip-based liquidity (swap) fees paid by users when swapping through MAYAChain.",
  Revenue: "10% of swap fees accrue to $MAYA holders.",
  ProtocolRevenue: "Protocol does not accrue revenue.",
  HoldersRevenue: "10% of swap fees accrue to $MAYA holders.",
  SupplySideRevenue: "90% of swap fees accrue to MAYAChain liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Slip-based liquidity (swap) fees paid by users on MAYAChain's pools, converted from CACAO to USD at that day's CACAO price.",
  },
  UserFees: {
    "Swap Fees": "Slip-based liquidity (swap) fees paid by users when swapping through MAYAChain.",
  },
  Revenue: {
    "Swap Fees To $MAYA Holders": "10% of swap fees accrue to $MAYA holders.",
  },
  HoldersRevenue: {
    "Swap Fees To $MAYA Holders": "10% of swap fees accrue to $MAYA holders.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "90% of swap fees accrue to MAYAChain liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MAYA],
  start: '2023-03-16', // MAYAChain mainnet launch
  methodology,
  breakdownMethodology,
};

export default adapter;
