import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const cardz_fees_url = "https://app.cardz.game/api/cardz/defifees";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const result = await fetchURL(
    `${cardz_fees_url}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`
  );


  const cardSales = Number(result.data?.cardSales);
  const cardBuybacks = Number(result.data?.cardBuybacks);
  const otherFees = Number(result.data?.otherFees);

  if (isNaN(cardSales) || isNaN(cardBuybacks) || isNaN(otherFees)) {
    throw new Error(`Cardz API returned invalid or missing numeric fields for date ${options.dateString}`);
  }

  const dailyFees = cardSales - cardBuybacks + otherFees;

  return {
    dailyVolume: cardSales,
    dailyFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-01-01',
  allowNegativeValue: true,

  methodology: {
    Volume: "cardSales: Total card pack sales in the given time period (from Cardz Game external API).",
    Fees: "cardSales (card pack sales) - cardBuybacks (card repurchases by Cardz) + otherFees (platform collected fees e.g. marketplace trading fees). Data fetched from Cardz Game external API.",
  },

  breakdownMethodology: {
    Fees: {
      cardSales: "Total card pack sales amount in the given time period.",
      cardBuybacks: "Amount spent by Cardz on repurchasing or acquiring cards in the same period.",
      otherFees: "Platform actual collected fees such as marketplace trading fees (does not include full trade volume).",
    }
  }
};

export default adapter;