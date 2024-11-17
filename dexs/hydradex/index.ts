import { Chain } from '@defillama/sdk/build/general';
import { BreakdownAdapter, BaseAdapter, DISABLED_ADAPTER_KEY } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getStartTimestamp } from '../../helpers/getStartTimestamp';
import {
  wrapGraphError,
  getGraphDimensions2,
} from '../../helpers/getUniSubgraph';
import request from 'graphql-request';
import disabledAdapter from '../../helpers/disabledAdapter';

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
    throw new Error(`Error getting block: ${CHAIN.HYDRA} ${timestamp} ${wrapGraphError(e).message}`)
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

const methodology = {
  UserFees: 'User pays 0.3% fees on each swap.',
  ProtocolRevenue: 'Protocol have no revenue.',
  SupplySideRevenue: 'All user fees are distributed among LPs.',
  HoldersRevenue: 'Holders have no revenue.',
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.HYDRA]: {
        fetch: async (timestamp: number) => {
          return {
            timestamp
          }
        },
                meta: {
          methodology,
        },
      },
    },
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: v3Graphs(chain as Chain),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: chain,
          volumeField: VOLUME_USD,
        }),
        meta: {
          methodology: {
            ...methodology,
            UserFees: 'User pays 0.01%, 0.05%, 0.3%, or 1% on each swap.',
          },
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
