import { Chain } from '@defillama/sdk/build/general';
import { BreakdownAdapter, BaseAdapter, DISABLED_ADAPTER_KEY } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getStartTimestamp } from '../../helpers/getStartTimestamp';

import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
  wrapGraphError,
} from '../../helpers/getUniSubgraph';
import request, { gql } from 'graphql-request';
import disabledAdapter from '../../helpers/disabledAdapter';

const v2Endpoints = {
  [CHAIN.HYDRA]: 'https://info.hydradex.org/graphql',
};

const v3Endpoints = {
  [CHAIN.HYDRA]: 'https://graph.hydradex.org/subgraphs/name/v3-subgraph',
};

const VOLUME_USD = 'volumeUSD';
const FEES_USD = 'feesUSD';

const getV2CustomBlock = async (timestamp: number) => {
  const blockGraphQuery = `
    query get_block {
      blocks(orderBy: "height", first: 1, orderDirection: "desc", where: { timestamp_lte: ${timestamp} }) {
        number
      }
    }
  `;
  try {
    const blocks = (await request(v2Endpoints[CHAIN.HYDRA], blockGraphQuery)).blocks;
    return Number(blocks[0].number);
  } catch (e) {
    throw new Error(`Error getting block: ${CHAIN.HYDRA} ${timestamp} ${wrapGraphError(e).message}`)
  }
};

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

const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: 'volume',
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3,
  },
  totalVolume: {
    factory: 'hydraswapFactories',
    field: DEFAULT_TOTAL_VOLUME_FIELD,
    blockGraphType: 'Float!',
  },
  dailyVolume: {
    factory: 'getHydraswapDayDataById',
    field: DEFAULT_DAILY_VOLUME_FIELD,
    idGraphType: 'String!',
  },
  dailyFees: {
    factory: 'hydraswapDayData',
  },
  getCustomBlock: getV2CustomBlock,
});

const v3Graphs = getGraphDimensions({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: 'factories',
    field: VOLUME_USD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
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
        fetch: v2Graph(CHAIN.HYDRA),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: CHAIN.HYDRA,
          dailyDataField: 'hydraswapDayDatas',
        }),
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
