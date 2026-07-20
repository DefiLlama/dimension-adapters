import { Adapter, FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async ({ dateString, createBalances }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayData = historicalFees.find(feeItem => 
    feeItem.timestamp.split(' ')[0] === dateString
  );
  if (!dayData) {
    throw new Error(`No data found for ${dateString}`);
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
  chains: [CHAIN.COSMOS],
  fetch,
  start: '2022-04-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
