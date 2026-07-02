import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const v2Fees = 0.0035;
const v2Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v2";
const PROTOCOL_FEE = 0.001;

const fetch = async (options: FetchOptions) => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const factoryQuery = `{
    uniswapFactory(id: "0x8D2A8b8F7d200d75Bf5F9E84e01F9272f90EFB8b") {
      totalLiquidityUSD
      totalVolumeUSD
      txCount
    }
    uniswapDayData(id: ${dayID}) {
      dailyVolumeUSD
      date
    }
  }`;

  const response = await httpPost(v2Endpoints, {
    query: factoryQuery,
  });

  const dailyVolume = response.data.uniswapDayData.dailyVolumeUSD || "0";

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyVolume * v2Fees, "Swap Fees");
  dailySupplySideRevenue.addUSDValue(dailyVolume * (v2Fees - PROTOCOL_FEE), "Swap Fees to LPs");
  dailyProtocolRevenue.addUSDValue(dailyVolume * PROTOCOL_FEE, "Swap Fees to Protocol");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume: "Volume of all swaps on the BulbaSwap v2 exchange",
  Fees: "0.35% of swap fees charged on each swap",
  Revenue: "2/7th of swap fees go to the protocol",
  ProtocolRevenue: "2/7th of swap fees go to the protocol",
  SupplySideRevenue: "5/7th of swap fees go to liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "0.35% of swap fees charged on each swap",
  },
  Revenue: {
    "Swap Fees to Protocol": "2/7th of swap fees go to the protocol",
  },
  ProtocolRevenue: {
    "Swap Fees to Protocol": "2/7th of swap fees go to the protocol",
  },
  SupplySideRevenue: {
    "Swap Fees to LPs": "5/7th of swap fees go to liquidity providers",
  },
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MORPH],
  start: '2024-10-27',
  methodology,
  breakdownMethodology,
};

export default adapter;
