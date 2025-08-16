import { request, gql } from "graphql-request";
import { BaseAdapter, FetchOptions, FetchResultGeneric, IJSON, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_DAILY_FEES_FACTORY, DEFAULT_DAILY_FEES_FIELD, DEFAULT_TOTAL_FEES_FACTORY, DEFAULT_TOTAL_FEES_FIELD } from "../getUniSubgraphFees";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp, getUniswapDateId, handle200Errors } from "./utils";
import { getStartTimestamp } from "../getStartTimestamp";

const DEFAULT_TOTAL_VOLUME_FACTORY = "uniswapFactories";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DEFAULT_DAILY_VOLUME_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";
const DEFAULT_DAILY_DATE_FIELD = "date";
const DEFAULT_DAILY_PAIR_FACTORY = "pairDayDatas";

const DEFAULT_ID_TYPE = 'ID!'
const DEFAULT_BLOCK_TYPE = 'Int'

interface IGetChainVolumeFilterParams {
  name: string,
  type: string
}

interface IGetChainFetchVolumeParams {
  graphUrls: {
    [chains: string]: string
  },
  graphRequestHeaders?: {
    [chains: string]: RequestInit['headers']
  },
  dailyVolume?: {
    factory?: string,
    field?: string,
    dateField?: string,
    pairs?: string,
    idGraphType?: string
  },
  dailyFees?: {
    factory?: string,
    field?: string
  },
  feesPercent?: {
    type: "volume" | "fees"
    UserFees?: number,
    SupplySideRevenue?: number,
    ProtocolRevenue?: number,
    HoldersRevenue?: number,
    CreatorRevenue?: number,
    Revenue?: number
    Fees?: number
  },
  blacklistTokens?: IJSON<string[]>
}

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string
  },
  graphRequestHeaders?: {
    [chains: string]: RequestInit['headers']
  },
  totalVolume?: {
    factory?: string,
    field?: string,
    blockGraphType?: string
    filterParams?: IGetChainVolumeFilterParams[],
  },
  dailyVolume?: {
    factory?: string,
    field?: string,
    dateField?: string,
    pairs?: string,
    idGraphType?: string
  },
  totalFees?: {
    factory?: string,
    field?: string
  },
  dailyFees?: {
    factory?: string,
    field?: string
  },
  getCustomBlock?: (timestamp: number) => Promise<number>
  feesPercent?: {
    type: "volume" | "fees"
    UserFees?: number,
    SupplySideRevenue?: number,
    ProtocolRevenue?: number,
    HoldersRevenue?: number,
    CreatorRevenue?: number,
    Revenue?: number
    Fees?: number
  },
  blacklistTokens?: IJSON<string[]>
}

type pair = {
  token0: {
    symbol: string
    id: string
  }
  token1: {
    symbol: string
    id: string
  }
} & IJSON<string>


function graphDimensionFetch({
  graphUrls,
  graphRequestHeaders,
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: DEFAULT_DAILY_DATE_FIELD,
    pairs: DEFAULT_DAILY_PAIR_FACTORY,
    idGraphType: DEFAULT_ID_TYPE
  },
  dailyFees = {
    factory: DEFAULT_DAILY_FEES_FACTORY,
    field: DEFAULT_DAILY_FEES_FIELD,
  },
  feesPercent,
  blacklistTokens = {}
}: IGetChainFetchVolumeParams) {
  const graphFieldsDailyVolume = {
    factory: dailyVolume.factory ?? DEFAULT_DAILY_VOLUME_FACTORY,
    field: dailyVolume.field ?? DEFAULT_DAILY_VOLUME_FIELD,
    dateField: dailyVolume.dateField ?? DEFAULT_DAILY_DATE_FIELD, // For alternative query
    pairs: dailyVolume.pairs ?? DEFAULT_DAILY_PAIR_FACTORY,
    idGraphType: dailyVolume.idGraphType ?? DEFAULT_ID_TYPE
  }

  const dailyVolumeQuery = gql`
  query daily_volume ($id: ${graphFieldsDailyVolume.idGraphType}) {
      ${graphFieldsDailyVolume.factory} (id: $id) {
        ${graphFieldsDailyVolume.field}
      }
  }`;

  const alternativeDailyQuery = gql`
  query daily_volume_alternative ($timestamp: Int) {
    ${graphFieldsDailyVolume.factory}s (where: {${graphFieldsDailyVolume.dateField}: $timestamp}) {
      ${graphFieldsDailyVolume.dateField}
      ${graphFieldsDailyVolume.field}
    }
  }`;

  const graphFieldsDailyFees = {
    factory: dailyFees.factory ?? DEFAULT_DAILY_FEES_FACTORY,
    field: dailyFees.field ?? DEFAULT_DAILY_FEES_FIELD
  }

  const dailyFeesQuery = gql`
  query daily_fees ($id: ID!) {
    ${graphFieldsDailyFees.factory}(id: $id) {
      ${graphFieldsDailyFees.field}
    }
  }`;

  return async (_a: any, _b: any, options: FetchOptions) => {
    const chain = options.chain;
    const dailyVolumePairsQuery = blacklistTokens[chain] ? gql`
      query daily_volume_byPair ($timestamp_gt: Int, $timestamp_lte: Int) {
        pairDayDatas(where:{${graphFieldsDailyVolume.dateField}_gt: $timestamp_gt, ${graphFieldsDailyVolume.dateField}_lte: $timestamp_lte, ${graphFieldsDailyVolume.field}_not: 0}, orderBy: ${graphFieldsDailyVolume.field}, orderDirection: desc, first: 1000){
          date
          token0{
            symbol
            id
          }
          token1{
            symbol
            id
          }
          ${graphFieldsDailyVolume.field}
        }
      }
      `
      : undefined;
    const { startTimestamp, endTimestamp } = options;
    // Get params
    const id = String(getUniswapDateId(new Date(endTimestamp * 1000)));
    // Execute queries
    // DAILY VOLUME
    let graphResDailyVolume;
    let dailyVolume: any;
    if (dailyVolumePairsQuery) {
      console.info("Calculating volume excluding blacklisted tokens...");
      graphResDailyVolume = await request(
        graphUrls[chain],
        dailyVolumePairsQuery,
        {
          timestamp_gt: startTimestamp,
          timestamp_lte: endTimestamp,
        },
        graphRequestHeaders?.[chain],
      );
      dailyVolume = graphResDailyVolume?.[
        graphFieldsDailyVolume.pairs
      ]?.reduce((acc: number | undefined, current: pair) => {
        if (
          blacklistTokens[chain].includes(current.token0.id) ||
          blacklistTokens[chain].includes(current.token1.id)
        )
          return acc;
        if (current?.[graphFieldsDailyVolume.field]) {
          if (acc) return acc += +current?.[graphFieldsDailyVolume.field]
          return +current?.[graphFieldsDailyVolume.field]
        }
        return acc
      }, undefined as number | undefined)
    } else {
      graphResDailyVolume = await request(graphUrls[chain], dailyVolumeQuery, { id }, graphRequestHeaders?.[chain])
      dailyVolume = graphResDailyVolume?.[graphFieldsDailyVolume.factory]?.[graphFieldsDailyVolume.field]
      if (!graphResDailyVolume || !dailyVolume) {
        console.info("Attempting with alternative query...")
        graphResDailyVolume = await request(graphUrls[chain], alternativeDailyQuery, { timestamp: getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000)) }, graphRequestHeaders?.[chain])
        const factory = graphFieldsDailyVolume.factory.toLowerCase().charAt(graphFieldsDailyVolume.factory.length - 1) === 's' ? graphFieldsDailyVolume.factory : `${graphFieldsDailyVolume.factory}s`
        dailyVolume = graphResDailyVolume?.[factory].reduce((p: any, c: any) => p + Number(c[graphFieldsDailyVolume.field]), 0);
      }
    }

    // DAILY FEES
    const graphResDailyFees = await request(graphUrls[chain], dailyFeesQuery, { id }, graphRequestHeaders?.[chain]);
    const dailyFees = graphResDailyFees?.[graphFieldsDailyFees.factory]?.[graphFieldsDailyFees.field]

    const response: FetchResultGeneric = {
      dailyVolume,
      dailyFees
    };

    if (feesPercent) {
      const feeBase = feesPercent.type
      const dailyBase = feeBase === 'volume' ? dailyVolume : dailyFees
      Object.entries(feesPercent).forEach(([feeType, feePercentType]) => {
        if (typeof feePercentType !== "number") return
        if (dailyBase !== undefined && response[`daily${feeType}`] === undefined)
          response[`daily${feeType}`] = new BigNumber(dailyBase).multipliedBy(feePercentType / 100).toString()
      })
    }
    return response
  };
};

function getGraphDimensions2({
  graphUrls,
  graphRequestHeaders,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
    blockGraphType: DEFAULT_BLOCK_TYPE
  },
  totalFees = {
    factory: DEFAULT_TOTAL_FEES_FACTORY,
    field: DEFAULT_TOTAL_FEES_FIELD,
  },
  getCustomBlock,
  feesPercent,
}: IGetChainVolumeParams) {
  const graphFieldsTotalVolume = {
    factory: totalVolume.factory ?? DEFAULT_TOTAL_VOLUME_FACTORY,
    field: totalVolume.field ?? DEFAULT_TOTAL_VOLUME_FIELD,
    blockGraphType: totalVolume.blockGraphType ?? DEFAULT_BLOCK_TYPE
  }
  const totalVolumeQuery = gql`
  query total_volume ($block: ${graphFieldsTotalVolume.blockGraphType}) {
    ${graphFieldsTotalVolume.factory}(block: { number: $block }) {
      ${graphFieldsTotalVolume.field}
    }
  }`;

  const graphFieldsTotalFees = {
    factory: totalFees.factory ?? DEFAULT_TOTAL_FEES_FACTORY,
    field: totalFees.field ?? DEFAULT_TOTAL_FEES_FIELD
  }
  const totalFeesQuery = gql`
  query total_fees ($block: ${graphFieldsTotalVolume.blockGraphType}) {
    ${graphFieldsTotalFees.factory}(block: { number: $block }) {
      ${graphFieldsTotalFees.field}
    }
  }`;
  return async (options: FetchOptions) => {
    const { chain, endTimestamp, startTimestamp, getEndBlock, getStartBlock } = options;

    const endBlock = await (getCustomBlock ? getCustomBlock(endTimestamp) : getEndBlock());
    const startBlock = await (getCustomBlock ? getCustomBlock(startTimestamp) :getStartBlock());

    let dailyVolume: any;
    const graphResTotalVolume = await request(graphUrls[chain], totalVolumeQuery, { block: endBlock }, graphRequestHeaders?.[chain]);
    const totalVolume = graphResTotalVolume?.[graphFieldsTotalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalVolume.field]), 0)?.toString()

    // PREV TOTAL VOLUME
    const graphResPrevTotalVolume = await request(graphUrls[chain], totalVolumeQuery, { block: startBlock }, graphRequestHeaders?.[chain]);
    const prevTotalVolume = graphResPrevTotalVolume?.[graphFieldsTotalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalVolume.field]), 0)?.toString()
    dailyVolume = totalVolume - prevTotalVolume

    // TOTAL FEES

    const graphResTotalFees = await request(graphUrls[chain], totalFeesQuery, { block: endBlock }, graphRequestHeaders?.[chain]).catch(_e => {
      if (totalVolume === undefined || feesPercent?.Fees === undefined)
        console.error(`Unable to get total fees on ${chain} from graph.`)
    });
    const totalFees = graphResTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    // PREV TOTAL FEES
    const graphResPrevTotalFees = await request(graphUrls[chain], totalFeesQuery, { block: startBlock }, graphRequestHeaders?.[chain]).catch(_e => {
      if (totalVolume === undefined || feesPercent?.Fees === undefined)
        console.error(`Unable to get total fees on ${chain} from graph.`)
    });
    const prevTotalFees = graphResPrevTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    const dailyFees = (totalFees == undefined && prevTotalFees == undefined) ? undefined : totalFees - prevTotalFees

    // const graphResTotalFees = await request(graphUrls[chain], totalFeesQuery, { block: endBlock }, graphRequestHeaders?.[chain]);
    // const totalFees = graphResTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    // // PREV TOTAL FEES
    // const graphResPrevTotalFees = await request(graphUrls[chain], totalFeesQuery, { block: startBlock }, graphRequestHeaders?.[chain]);
    // const prevTotalFees = graphResPrevTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    // const dailyFees = (totalFees == undefined && prevTotalFees == undefined) ? undefined : totalFees - prevTotalFees

    // ts-node --transpile-only cli/testAdapter.ts protocols uniswap
    let response: FetchResultGeneric = {
      dailyVolume,
      dailyFees,
    };

    if (feesPercent) {
      const feeBase = feesPercent.type
      const dailyBase = feeBase === 'volume' ? dailyVolume : dailyFees
      Object.entries(feesPercent).forEach(([feeType, feePercentType]) => {
        if (typeof feePercentType !== "number") return
        if (dailyBase !== undefined && response[`daily${feeType}`] === undefined)
          response[`daily${feeType}`] = new BigNumber(dailyBase).multipliedBy(feePercentType / 100).toString()
      })
    }
    return response
  };
};


function univ2DimensionAdapter2(params: IGetChainVolumeParams, info?: any) {
  const methodology = info?.methodology
  const graphs = getGraphDimensions2(params);

  const adapter: SimpleAdapter = {
    methodology,
    adapter: Object.keys(params.graphUrls).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: graphs,
          start: getStartTimestamp({
            endpoints: params.graphUrls,
            chain,
            volumeField: params.dailyVolume?.field,
            dailyDataField: params.dailyVolume?.factory + "s",
            dateField: params.dailyVolume?.dateField,
          }),
        },
      };
    }, {} as BaseAdapter),
    version: 2
  };

  return adapter;
}

function wrapGraphError(e: Error) {
  const message = (e as any).response?.errors?.[0]?.message ?? e.message;
  return new Error(shortenString(message));

  function shortenString(str: string, maxLength: number = 420) {
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  }
}

export {
  wrapGraphError,
  graphDimensionFetch,
  getGraphDimensions2,
  univ2DimensionAdapter2,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
};
