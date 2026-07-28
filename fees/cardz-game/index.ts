import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const cardz_fees_url = "https://app.cardz.game/api/cardz/defifees";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
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

  const dailyFees = options.createBalances();
  const buybacks = options.createBalances();

  buybacks.addUSDValue(cardBuybacks);

  dailyFees.addUSDValue(cardSales, "Card Sales");
  dailyFees.subtract(buybacks, "Card Buybacks");
  dailyFees.addUSDValue(otherFees, "Other Fees");

  return {
    dailyVolume: cardSales,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const breakdownMethodology = {
  Fees: {
    "Card Sales": "Total revenue from card pack sales in the given time period.",
    "Card Buybacks": "Total spent on card repurchases in the given time period.",
    "Other Fees": "Non-card related fees in the given time period.",
  },
  Revenue: {
    "Card Sales": "Total revenue from card pack sales in the given time period.",
    "Card Buybacks": "Total spent on card repurchases in the given time period.",
    "Other Fees": "Non-card related fees in the given time period.",
  },
  ProtocolRevenue: {
    "Card Sales": "Total revenue from card pack sales in the given time period.",
    "Card Buybacks": "Total spent on card repurchases in the given time period.",
    "Other Fees": "Non-card related fees in the given time period.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-01-01',
  allowNegativeValue: true, // buybacks can exceed card sales for a period of time
  methodology: {
    Volume: "cardSales: Total card pack sales in the given time period.",
    Fees: "cardSales (card pack sales) - cardBuybacks (card repurchases) + otherFees (platform fees).",
    Revenue: "Net revenue retained by the protocol after buybacks.",
    ProtocolRevenue: "Revenue kept by the protocol.",
    SupplySideRevenue: "Revenue allocated to suppliers/partners (currently 0).",
  },
  breakdownMethodology,
};

export default adapter;
