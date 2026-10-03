import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const volumeEndpoint = "https://public-osmosis-api.numia.xyz/volume/historical/chart";
const MAX_FEES_TO_VOLUME = 0.05;

const fetch = async ({ dateString, createBalances }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayData = historicalFees.find(feeItem => 
    feeItem.timestamp.split(' ')[0] === dateString
  );
  if (!dayData) {
    throw new Error(`No data found for ${dateString}`);
  }

  const historicalVolume: { time: string, value: number }[] = await fetchURL(volumeEndpoint);
  const dayVolume = historicalVolume.find(dayItem => dayItem.time.split('T')[0] === dateString)?.value;
  if (dayVolume === undefined) {
    throw new Error(`osmosis: no swap volume for ${dateString} to check the reported fees against`);
  }
  if (dayData.dailyFees > MAX_FEES_TO_VOLUME * dayVolume) {
    throw new Error(`osmosis: numia reports ${Math.round(dayData.dailyFees)} of fees for ${dateString} on ${Math.round(dayVolume)} of swap volume; refusing it until the source is corrected`);
  }

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.addUSDValue(dayData.dailyFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(dayData.dailyRevenue, "Token Swap Fees to Protocol");
  dailySupplySideRevenue.addUSDValue(dayData.dailyFees - dayData.dailyRevenue, "Token Swap Fees to LPs");


  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees paid by traders to liquidity pools",
  Revenue: "Taker fees collected by the protocol",
  SupplySideRevenue: "Swap fees distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders to liquidity pools",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "Taker fees collected by the protocol",
  },
  SupplySideRevenue: {
    "Token Swap Fees to LPs": "Swap fees distributed to liquidity providers",
  },
}

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.OSMOSIS],
  fetch,
  start: '2022-04-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
