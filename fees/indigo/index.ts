import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ANALYTICS_API_ENDPOINT = 'https://analytics.indigoprotocol.io';

const INDY_TOKEN = '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459';
const IUSD_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344';
const IBTC_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069425443';
const IETH_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069455448';
const ISOL_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069534f4c';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  // Revenue is the total amount of payments to the DAO made by CDPs.
  const revenueResponse = await axios.get(
    ANALYTICS_API_ENDPOINT + `/api/revenue/cdp-interest-payments?totals&from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const dailyRevenueUSD = options.createBalances();
  dailyRevenueUSD.addCGToken('cardano', Number(revenueResponse.data.totals['lovelace'] ?? 0) / 1_000_000);

  // Fees are all assets that have been collected by the protocol: ADA, INDY, iUSD, iBTC, iETH, and iSOL.
  const flowsResponse = await axios.get(
    ANALYTICS_API_ENDPOINT + `/api/revenue/flows?totals&from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const dailyFeesUSD = options.createBalances();
  dailyFeesUSD.addCGToken('cardano', Number(flowsResponse.data.totals['lovelace'] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol', Number(flowsResponse.data.totals[INDY_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-iusd', Number(flowsResponse.data.totals[IUSD_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-ibtc', Number(flowsResponse.data.totals[IBTC_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-ieth', Number(flowsResponse.data.totals[IETH_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-isol', Number(flowsResponse.data.totals[ISOL_TOKEN] ?? 0) / 1_000_000);

  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2024-05-16',
      meta: {
        methodology: {
          Fees: "All deposits to Indigo Protocol DAO Treasury.",
          Revenue: "All deposits from CDP Interest payments to Indigo.",
        }
      }
    },
  },
};

export default adapter;
