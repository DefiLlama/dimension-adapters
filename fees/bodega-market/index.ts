import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data = await fetchURL(
    `https://tidelabs.io/api/defillama/bodega-market/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  const { dailyFees, dailyRevenue } = data;

  const df = options.createBalances();
  const dr = options.createBalances();
  const dhr = options.createBalances();
  const dpr = options.createBalances();

  const cutoffTimestamp = 1749686400; // Jun 12, 2025 UTC start of day

  df.addCGToken("cardano", Number(dailyFees));
  dr.addCGToken("cardano", Number(dailyRevenue))

  // https://x.com/BodegaCardano/status/1933113161244389720
  if (options.startTimestamp < cutoffTimestamp) {
    // Before Jun 12, 2025
    dhr.addCGToken("cardano", Number(dailyRevenue) * 0.75);
    dpr.addCGToken("cardano", Number(dailyRevenue) * 0.25);
  } else {
    dhr.addCGToken("cardano", Number(dailyRevenue));
    dpr.addCGToken("cardano", 0);
  }

  return {
    dailyFees: df,
    dailyUserFees: df,
    dailyRevenue: dr,
    dailyHoldersRevenue: dhr,
    dailyProtocolRevenue: dpr,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2024-06-04",
      meta: {
        methodology: {
          Fees: "All betting fees (4% of total protocol volume) paid by users.",
          Revenue: "All betting fees (4% of total protocol volume) paid by users.",
          HoldersRevenue: "All revenue distributed to BODEGA holders (75%) before Jun 12, 2025 and 100% after Jun 12, 2025.",
          ProtocolRevenue: "No revenue for Bodega protocol after Jun 12, 2025 and 25% before Jun 12, 2025.",
        },
      },
    },
  },
};

export default adapter;
