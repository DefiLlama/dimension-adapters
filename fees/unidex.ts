import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { Chain } from "../adapters/types";
import request, { gql } from "graphql-request";

type TChainIDs = { [key in Chain]?: number };
const chainIDs: TChainIDs = {
  [CHAIN.FANTOM]: 250,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.ERA]: 324,
  [CHAIN.BASE]: 8453,
  [CHAIN.EVMOS]: 9001,
};

interface IDayProduct {
  cumulativeFeesUsd: number;
  chainId: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
      query MyQuery {
        DayProducts(filter: {date: ${todaysTimestamp}}) {
          cumulativeFeesUsd
          chainId
        }
      }
    `;

    const endpoint = "https://arkiver.moltennetwork.com/graphql";
    const response = await request(endpoint, graphQuery);
    const dayProducts: IDayProduct[] = response.DayProducts;

    const feesByChain: { [chainId: number]: number } = {};
    dayProducts.forEach((product) => {
      const chainId = product.chainId;
      if (chainId === 360) {
        feesByChain[42161] = (feesByChain[42161] || 0) + product.cumulativeFeesUsd;
      } else {
        feesByChain[chainId] = (feesByChain[chainId] || 0) + product.cumulativeFeesUsd;
      }
    });

    const chainID = chainIDs[chain];
    const dailyFeeUSD = chainID !== undefined ? feesByChain[chainID] || 0 : 0;

    const dailyHoldersRevenue = dailyFeeUSD * 0.65;
    const dailyProtocolRevenue = dailyFeeUSD;
    const dailySupplySideRevenue = dailyFeeUSD * 0.20;

    return {
      dailyFees: dailyFeeUSD.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      timestamp,
    };
  };
};

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Fees going to the treasury + holders",
  SupplySideFees: "Fees going to liquidity providers of the protocol",
};

const adapter: Adapter = {
  methodology,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-06-22',
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: '2023-06-22',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-06-22',
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-06-22',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: '2023-06-22',
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: '2023-06-27',
    },
    [CHAIN.EVMOS]: {
      fetch: fetch(CHAIN.EVMOS),
      start: '2023-11-16',
    },
  },
};

export default adapter;