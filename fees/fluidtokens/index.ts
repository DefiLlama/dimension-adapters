import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEES_API = "https://api.fluidtokens.com/liquidity/fees/daily";

interface FluidTokensFeesResponse {
  _id?: string;
  address: string;
  date: string;
  __v?: number;
  createdAt?: string;
  updatedAt?: string;
  timestamp?: string;
  status: "provisional" | "final";
  hoursCovered: number;
  hoursExpected: number;
  stats: {
    totalFeesLovelace: number;
    totalFeesAda: number;
    totalRevenueLovelace: number;
    totalRevenueAda: number;
    totalProtocolRevenueLovelace: number;
    totalProtocolRevenueAda: number;
    adaDirectLovelace: number;
    adaDirectAda: number;
    adaFromTokensLovelace: number;
    adaFromTokensAda: number;
    pricedTokensCount: number;
    unpricedTokensCount: number;
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dateString = new Date(options.startOfDay * 1000)
    .toISOString()
    .split("T")[0];

  const response = (await fetchURL(
    `${FEES_API}?date=${dateString}`
  )) as FluidTokensFeesResponse;

  if (
    !response?.stats ||
    typeof response.stats.totalFeesAda !== "number" ||
    typeof response.stats.totalRevenueAda !== "number" ||
    typeof response.stats.totalProtocolRevenueAda !== "number" ||
    !Number.isFinite(response.stats.totalFeesAda) ||
    !Number.isFinite(response.stats.totalRevenueAda) ||
    !Number.isFinite(response.stats.totalProtocolRevenueAda) ||
    response.stats.totalFeesAda < 0 ||
    response.stats.totalRevenueAda < 0 ||
    response.stats.totalProtocolRevenueAda < 0 ||
    response.date !== dateString
  ) {
    throw new Error(`Fees data not found for FluidTokens on ${dateString}`);
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addCGToken("cardano", Number(response.stats.totalFeesAda));
  dailyRevenue.addCGToken("cardano", Number(response.stats.totalRevenueAda));
  dailyProtocolRevenue.addCGToken(
    "cardano",
    Number(response.stats.totalProtocolRevenueAda)
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2026-03-02",
    },
  },
  methodology: {
    Fees:
      "Gross value received by the FluidTokens treasury-only fee address, sourced from the FluidTokens daily fees endpoint and denominated in ADA.",
    Revenue:
      "All value received by the treasury-only FluidTokens fee address is treated as protocol revenue.",
    ProtocolRevenue:
      "Because the tracked address is treasury-only, all recorded revenue is classified as protocol treasury revenue.",
  },
};

export default adapter;
