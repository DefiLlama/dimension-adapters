import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const USDN_API = "https://extra-metrics-api-production.up.railway.app/usdn24hour";

const methodology = {
  Fees: "Fees collected from USDN swaps over 24h.",
  Revenue: "Revenue generated from USDN Season 2 vault over 24h.",
};

interface USDNResponse {
  usdn_fees: number;
  usdn_season_2_vault_rev: number;
}

const fetch = async (_options: FetchOptions) => {
  const response: USDNResponse = await httpGet(USDN_API);

  return {
    dailyFees: response.usdn_fees,
    dailyRevenue: response.usdn_season_2_vault_rev,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.NOBLE]: {
      fetch,
      start: "2024-04-01",
      runAtCurrTime: true,
    },
  },
  methodology,
};

export default adapter;