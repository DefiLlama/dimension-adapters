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
    !Number.isFinite(response.stats.totalFeesAda) ||
    response.stats.totalFeesAda < 0 ||
    response.date !== dateString
  ) {
    throw new Error(`Fees data not found for FluidTokens on ${dateString}`);
  }


  const dailyFees = options.createBalances();
  dailyFees.addCGToken("cardano", Number(response.stats.totalFeesAda));

  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2026-02-28",
    },
  },
  methodology: {
    Fees:
      "Gross value received by the FluidTokens fee address, sourced from the FluidTokens daily fees endpoint and denominated in ADA.",
  },
};

export default adapter;
