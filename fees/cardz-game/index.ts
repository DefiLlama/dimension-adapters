import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const cardz_fees_url = "https://app.cardz.game/api/cardz/defifees";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const result = await fetchURL(
    `${cardz_fees_url}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`
  );

  const cardSales = Number(result.data?.cardSales || 0);
  const cardBuybacks = Number(result.data?.cardBuybacks || 0);
  const otherFees = Number(result.data?.otherFees || 0);

  if (isNaN(cardSales) || isNaN(cardBuybacks) || isNaN(otherFees)) {
    throw new Error(`Cardz API returned invalid or missing numeric fields for date ${options.dateString}`);
  }

  if (cardSales < 0) {
    throw new Error(`Invalid negative cardSales (${cardSales}) on ${options.dateString}`);
  }

  const dailyFees = cardSales - cardBuybacks + otherFees;

  return {
    dailyVolume: cardSales,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-01-01',
  allowNegativeValue: true,

  methodology: {
    Volume: "cardSales: Total card pack sales in the given time period.",
    Fees: "cardSales (card pack sales) - cardBuybacks (card repurchases) + otherFees (platform fees).",
    Revenue: "Net revenue retained by the protocol after buybacks.",
    ProtocolRevenue: "Revenue kept by the protocol.",
    SupplySideRevenue: "Revenue allocated to suppliers/partners (currently 0).",
  }
};

export default adapter;