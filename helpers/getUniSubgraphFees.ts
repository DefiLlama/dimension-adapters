import {
  ChainBlocks,
  Adapter,
  BreakdownAdapter,
  BaseAdapter,
  FetchResultVolume,
  FetchResultGeneric,
} from "../adapters/types";
import { Chain } from "../adapters/types";
import { setModuleDefaults } from "../adapters/utils/runAdapter";

import BigNumber from "bignumber.js";
import { request, gql } from "graphql-request";
import { getBlock } from "../helpers/getBlock";
import {
  getUniqStartOfTodayTimestamp,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
} from "../helpers/getUniSubgraphVolume";
import type { ChainEndpoints, Fetch, FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types";

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
        dailyFees: graphRes[DEFAULT_DAILY_FEES_FACTORY][DEFAULT_DAILY_FEES_FIELD],
        dailyRevenue: "0",
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

          return {
            dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
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
  setModuleDefaults(volumeAdapter)
  if ('adapter' in volumeAdapter) {
    let finalBaseAdapter: BaseAdapter = {}
    const adapterObj = volumeAdapter.adapter

    if (adapterObj) {
      Object.keys(adapterObj).map(chain => {
        const fetchFees = async (options: FetchOptions) => {
          const fetchedResult: FetchResultV2 = await (adapterObj[chain].fetch as FetchV2)(options)
          const chainDailyVolume = fetchedResult.dailyVolume as number;
          const response: FetchResultV2 = { }
          if (chainDailyVolume !== undefined) {
            if (totalFees)
              response["dailyFees"] = new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString()
            if (params.userFees !== undefined)
              response["dailyUserFees"] = new BigNumber(chainDailyVolume).multipliedBy(params.userFees).toString()
            if (params.revenue !== undefined)
              response["dailyRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(params.revenue).toString()
            if (params.holdersRevenue !== undefined)
              response["dailyHoldersRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(params.holdersRevenue).toString()
            if (params.supplySideRevenue !== undefined)
              response["dailySupplySideRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(params.supplySideRevenue).toString()
            if (protocolFees !== undefined)
              response["dailyProtocolRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(protocolFees).toString()
          }
          return response
        }

        const baseAdapter: BaseAdapter = {
          [chain]: {
            ...adapterObj[chain],
            fetch: fetchFees,
          }
        }
        finalBaseAdapter = { ...baseAdapter, ...finalBaseAdapter }
        return baseAdapter
      });
    }

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

      const chainDailyVolume = hasDailyVolume ? (graphRes?.[dailyVolume.factory]?.[dailyVolume.field] ?? "0") : undefined;

      return {
        dailyFees: (hasDailyVolume && chainDailyVolume) ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
        dailyRevenue: (hasDailyVolume && chainDailyVolume) ? new BigNumber(chainDailyVolume).multipliedBy(protocolFees).toString() : undefined
      };
    };
  };
}

export {
  getUniqStartOfTodayTimestamp,
  getDexChainFees,
  getDexChainFeesRaw,
  getDexChainBreakdownFees,
  getUniswapV3Fees,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_TOTAL_FEES_FACTORY,
  DEFAULT_TOTAL_FEES_FIELD,
  DEFAULT_DAILY_FEES_FACTORY,
  DEFAULT_DAILY_FEES_FIELD,
};
