import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";

const KAIO_TVL_API = "https://api.kaio.xyz/api/v1/tvl";
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

// Source: RWA.xyz asset pages list annual management fees for each KAIO fund.
const MANAGEMENT_FEE_RATES: Record<string, number> = {
  VOLTx: 0.0105, // https://app.rwa.xyz/assets/VOLTx
  MACROx: 0.005, // https://app.rwa.xyz/assets/MACROx
  SCOPEx: 0.005, // https://app.rwa.xyz/assets/SCOPEx
  CASHx: 0.0015, // https://app.rwa.xyz/assets/CASHx
};

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const { assets } = await fetchURLAutoHandleRateLimit(KAIO_TVL_API);
  if (!assets?.length) throw new Error("Missing KAIO TVL assets");

  const periodInYears = (options.toTimestamp - options.fromTimestamp) / YEAR_IN_SECONDS;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const { symbol, tvl } of assets) {
    const managementFees = (tvl || 0) * (MANAGEMENT_FEE_RATES[symbol] || 0) * periodInYears;

    dailyFees.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL],
  methodology: {
    Fees: "Estimated daily management fees from KAIO's current TVL and the annual fund fee rates listed on RWA.xyz.",
    Revenue: "Management fees are counted as protocol revenue.",
    ProtocolRevenue: "All estimated management fee revenue is attributed to the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]: "Estimated management fees from KAIO's current TVL and the annual fund fee rates listed on RWA.xyz.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fees are counted as protocol revenue.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "All estimated management fee revenue is attributed to the protocol.",
    },
  },
  runAtCurrTime: true,
  start: "2026-05-13",
};

export default adapter;
