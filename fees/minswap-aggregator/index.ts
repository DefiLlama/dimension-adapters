import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL = 'https://api-mainnet-prod.minswap.org/defillama/v2/aggregator-fee-series';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const res = await fetchURL(
    `${URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`
  );

  const dailyFees = options.createBalances();
  // Number() is required: API returns decimal strings (e.g. "123.456789").
  // addCGToken passes strings through BigInt() which rejects decimals.
  dailyFees.addCGToken("cardano", Number(res.dailyFees));

  return {
    timestamp: res.timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2025-05-21",
    },
  },
  methodology: {
    Fees: "Fees collected by the Minswap aggregator on routed swaps.",
    Revenue: "All aggregator fees go to the protocol (100% protocol revenue).",
    ProtocolRevenue: "All aggregator fees go to the protocol treasury.",
  },
};

export default adapter;
