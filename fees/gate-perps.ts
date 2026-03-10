import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<any> {
  const endpointWithDate = `https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama?date=${options.dateString}&broker=aden`;

  const data = await fetchURL(endpointWithDate);

  if (!data) {
    throw new Error("Data missing for date: " + options.dateString);
  }

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(Number(data.fees), 'swap fees');
  dailyVolume.addUSDValue(Number(data.volume));

  return {
    dailyVolume: data.volume,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: "Swap fees collected from Gate Layer Network(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
};

const breakdownMethodology = {
  Fees: {
    "swap fees": "Fees collected from perpetual trading on Gate Layer Network, charged at 0.4 basis points on taker volume",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.GATE_LAYER],
  start: '2025-11-03',
  methodology,
  breakdownMethodology,
};

export default adapter;
