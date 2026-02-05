import { Chain } from "../../adapters/types";
import { BreakdownAdapter, BaseAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getStartTimestamp } from '../../helpers/getStartTimestamp';
import {
  wrapGraphError,
  getGraphDimensions2,
} from '../../helpers/getUniSubgraph';
import request from 'graphql-request';

const v3Endpoints = {
  [CHAIN.HYDRA]: 'https://graph.hydradex.org/subgraphs/name/v3-subgraph',
};

const VOLUME_USD = 'volumeUSD';
const FEES_USD = 'feesUSD';

const getV3CustomBlock = async (timestamp: number) => {
  const blockGraphQuery = `
    query get_block {
      blocks(orderBy: "number", first: 1, orderDirection: "desc", where: { timestamp_lte: ${timestamp} }) {
        number
      }
    }
  `;

  try {
    const blocks = (
      await request('https://graph.hydradex.org/subgraphs/name/blocklytics/ethereum-blocks', blockGraphQuery)
    ).blocks;
    return Number(blocks[0].number);
  } catch (e) {
    throw new Error(`Error getting block: ${CHAIN.HYDRA} ${timestamp} ${wrapGraphError(e as any).message}`)
  }
};

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: 'factories',
    field: VOLUME_USD,
  },
  feesPercent: {
    type: 'fees',
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Revenue is 100% of collected fees
  },
  totalFees: {
    field: FEES_USD,
  },
  getCustomBlock: getV3CustomBlock,
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.HYDRA]: {
        fetch: async (timestamp: number) => {
          return {
            timestamp
          }
        },
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs,
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
