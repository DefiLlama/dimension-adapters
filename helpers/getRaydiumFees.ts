import { Chain } from "../adapters/types";
import {
  Adapter,
  BaseAdapter,
  BreakdownAdapter,
  ChainBlocks,
  FetchResultVolume
} from "../adapters/types";

import BigNumber from "bignumber.js";
import { gql, request } from "graphql-request";
import type { ChainEndpoints, Fetch, FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types";
import { getBlock } from "./getBlock";
import {
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getUniqStartOfTodayTimestamp,
} from "./getUniSubgraphVolume";

// To get ID for daily data https://docs.uniswap.org/protocol/V2/reference/API/entities
const getUniswapDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;

const DEFAULT_TOTAL_FEES_FACTORY = "factories";
const DEFAULT_TOTAL_FEES_FIELD = "totalFeesUSD";

const DEFAULT_DAILY_FEES_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_FEES_FIELD = "feesUSD";

interface IGetRawChainFeeParams {
  graphUrls: ChainEndpoints,
  totalFees?: number,
  protocolFees?: number,
  totalVolume?: {
    factory: string,
    field: string
  },
  dailyVolume?: {
    factory: string,
    field: string
  },
  customDailyVolume?: string,
  hasDailyVolume?: boolean
  hasTotalVolume?: boolean
  getCustomBlock?: (timestamp: number) => Promise<number>
}

interface IGetChainFeeParams {
  volumeAdapter: Adapter,
  totalFees?: number,
  protocolFees?: number,
  revenue?: number,
  userFees?: number,
  supplySideRevenue?: number,
  holdersRevenue?: number,
  meta?: BaseAdapter[string]['meta']
}


const getUniswapV3Fees = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($dateId: Int!) {
    ${DEFAULT_DAILY_FEES_FACTORY}(id: $dateId) {
      ${DEFAULT_DAILY_FEES_FIELD}
    },
    ${DEFAULT_TOTAL_FEES_FACTORY} {
      ${DEFAULT_TOTAL_FEES_FIELD}
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = getUniswapDateId(new Date(timestamp * 1000));

      const graphRes = await request(graphUrls[chain], graphQuery, {
        dateId,
      });

      return {
        timestamp,
        totalFees: graphRes[DEFAULT_TOTAL_FEES_FACTORY][0][DEFAULT_TOTAL_FEES_FIELD],
        dailyFees: graphRes[DEFAULT_DAILY_FEES_FACTORY][DEFAULT_DAILY_FEES_FIELD],
        totalRevenue: "0", // uniswap has no rev yet
        dailyRevenue: "0", // uniswap has no rev yet
      };
    };
  };
};

const getDexChainBreakdownFees = ({ volumeAdapter, totalFees = 0, protocolFees = 0 }: IGetChainFeeParams) => {
  if ('breakdown' in volumeAdapter) {
    let breakdownAdapter = {} as BreakdownAdapter['breakdown']
    const volumeBreakdownAdapter = volumeAdapter.breakdown

    for (const [version, adapterObj] of Object.entries(volumeBreakdownAdapter)) {
      const volAdapter: BaseAdapter = adapterObj

      const baseAdapters = Object.keys(volAdapter).map(chain => {
        const fetchFees = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions) => {
          const fetchedResult: FetchResultVolume = await (volAdapter[chain].fetch as Fetch)(timestamp, chainBlocks, options)
          const chainDailyVolume = fetchedResult.dailyVolume ? fetchedResult.dailyVolume as number : "0";
          const chainTotalVolume = fetchedResult.totalVolume ? fetchedResult.totalVolume as number : "0";

          return {
            timestamp,
            totalFees: new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString(),
            dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
            totalRevenue: new BigNumber(chainTotalVolume).multipliedBy(protocolFees).toString(),
            dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(protocolFees).toString() : undefined
          };
        }

        const baseAdapter: BaseAdapter = {
          [chain]: {
            ...volAdapter[chain],
            fetch: fetchFees,
          }
        }
        return baseAdapter
      });

      breakdownAdapter = { [version]: baseAdapters[0], ...breakdownAdapter }
    }

    return breakdownAdapter;
  } else {
    console.log(`Failed to grab dex volume data (volume adapter not include 'breakdown' props)`)
    return {}
  }
}


const getDexChainFees = ({ volumeAdapter, totalFees = 0, protocolFees = 0, ...params }: IGetChainFeeParams) => {
  if ('adapter' in volumeAdapter) {
    let finalBaseAdapter: BaseAdapter = {}
    const adapterObj = volumeAdapter.adapter

    Object.keys(adapterObj).map(chain => {
      const fetchFees = async (options: FetchOptions) => {
        return await (adapterObj[chain].fetch as FetchV2)(options)
      }

      const baseAdapter: BaseAdapter = {
        [chain]: {
          ...adapterObj[chain],
          fetch: fetchFees,
          meta: params.meta
        }
      }
      finalBaseAdapter = { ...baseAdapter, ...finalBaseAdapter }
      return baseAdapter
    });

    return finalBaseAdapter;
  } else {
    console.log(`Failed to grab dex volume data (volume adapter not include 'volume' props)`, volumeAdapter)
    return {}
  }
}

// Raw method if we do not want to rely on dexVolumes
function getDexChainFeesRaw({
  graphUrls,
  totalFees = 0,
  protocolFees = 0,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  customDailyVolume = undefined,
  hasDailyVolume = true,
  hasTotalVolume = true,
  getCustomBlock = undefined,
}: IGetRawChainFeeParams) {
  const totalVolumeQuery = gql`
  ${totalVolume.factory}(
    block: { number: $block }
  ) {
    ${totalVolume.field}
  }
  `;

  const dailyVolumeQuery =
    customDailyVolume ||
    gql`
  ${dailyVolume.factory} (
    id: $id
  ) {
    ${dailyVolume.field}
  }
  `;

  const graphQuery = gql`
query get_volume($block: Int, $id: Int) {
  ${hasTotalVolume ? totalVolumeQuery : ""}
  ${hasDailyVolume ? dailyVolumeQuery : ""}
}
`;
  return (chain: Chain) => {
    return async (timestamp: number, chainBlocks: ChainBlocks) => {
      const block =
        (getCustomBlock && (await getCustomBlock(timestamp))) ||
        (await getBlock(timestamp, chain, chainBlocks));

      const id = getUniswapDateId(new Date(timestamp * 1000));

      const graphRes = await request(graphUrls[chain], graphQuery, {
        block,
        id,
      });

      const chainTotalVolume = graphRes[totalVolume.factory][0][totalVolume.field];
      const chainDailyVolume = hasDailyVolume ? (graphRes?.[dailyVolume.factory]?.[dailyVolume.field] ?? "0") : undefined;

      return {
        timestamp,
        block,
        totalFees: new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString(),
        dailyFees: (hasDailyVolume && chainDailyVolume) ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
        totalRevenue: new BigNumber(chainTotalVolume).multipliedBy(protocolFees).toString(),
        dailyRevenue: (hasDailyVolume && chainDailyVolume) ? new BigNumber(chainDailyVolume).multipliedBy(protocolFees).toString() : undefined
      };
    };
  };
}

export {
  DEFAULT_DAILY_FEES_FACTORY,
  DEFAULT_DAILY_FEES_FIELD, DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_FEES_FACTORY,
  DEFAULT_TOTAL_FEES_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD, getDexChainBreakdownFees, getDexChainFees,
  getDexChainFeesRaw, getUniqStartOfTodayTimestamp, getUniswapV3Fees
};

