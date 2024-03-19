import { Chain } from "@defillama/sdk/build/general";
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

function getGraphDimensions({
  graphUrls,
  graphRequestHeaders,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
    blockGraphType: DEFAULT_BLOCK_TYPE
  },
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: DEFAULT_DAILY_DATE_FIELD,
    pairs: DEFAULT_DAILY_PAIR_FACTORY,
    idGraphType: DEFAULT_ID_TYPE
  },
  totalFees = {
    factory: DEFAULT_TOTAL_FEES_FACTORY,
    field: DEFAULT_TOTAL_FEES_FIELD,
  },
  dailyFees = {
    factory: DEFAULT_DAILY_FEES_FACTORY,
    field: DEFAULT_DAILY_FEES_FIELD,
  },
  getCustomBlock,
  feesPercent,
  blacklistTokens = {}
}: IGetChainVolumeParams) {
  // DAILY VOLUME
  // Graph fields
  const graphFieldsDailyVolume = {
    factory: dailyVolume.factory ?? DEFAULT_DAILY_VOLUME_FACTORY,
    field: dailyVolume.field ?? DEFAULT_DAILY_VOLUME_FIELD,
    dateField: dailyVolume.dateField ?? DEFAULT_DAILY_DATE_FIELD, // For alternative query
    pairs: dailyVolume.pairs ?? DEFAULT_DAILY_PAIR_FACTORY,
    idGraphType: dailyVolume.idGraphType ?? DEFAULT_ID_TYPE
  }
  // Queries
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

  // TOTAL VOLUME
  // Graph fields
  const graphFieldsTotalVolume = {
    factory: totalVolume.factory ?? DEFAULT_TOTAL_VOLUME_FACTORY,
    field: totalVolume.field ?? DEFAULT_TOTAL_VOLUME_FIELD,
    blockGraphType: totalVolume.blockGraphType ?? DEFAULT_BLOCK_TYPE
  }
  // Queries
  const totalVolumeQuery = gql`
  query total_volume ($block: ${graphFieldsTotalVolume.blockGraphType}) {
    ${graphFieldsTotalVolume.factory}(block: { number: $block }) {
      ${graphFieldsTotalVolume.field}
    }
  }`;

  // DAILY FEES
  // Graph fields
  const graphFieldsDailyFees = {
    factory: dailyFees.factory ?? DEFAULT_DAILY_FEES_FACTORY,
    field: dailyFees.field ?? DEFAULT_DAILY_FEES_FIELD
  }
  // Query
  const dailyFeesQuery = gql`
  query daily_fees ($id: ID!) {
    ${graphFieldsDailyFees.factory}(id: $id) {
      ${graphFieldsDailyFees.field}
    }
  }`;

  // TOTAL FEES
  // Graph fields
  const graphFieldsTotalFees = {
    factory: totalFees.factory ?? DEFAULT_TOTAL_FEES_FACTORY,
    field: totalFees.field ?? DEFAULT_TOTAL_FEES_FIELD
  }
  // Query
  const totalFeesQuery = gql`
  query total_fees {
    ${graphFieldsTotalFees.factory} {
      ${graphFieldsTotalFees.field}
    }
  }`;

  return (chain: Chain) => {

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
    return async (options: FetchOptions) => {
      const { endTimestamp, getEndBlock } = options;
      // ts-node --transpile-only cli/testAdapter.ts protocols uniswap
      const customBlockFunc = getCustomBlock ? getCustomBlock : getEndBlock;
      const block =
        (await customBlockFunc(endTimestamp).catch((e: any) =>
          console.log(wrapGraphError(e).message),
        )) ?? undefined;
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
            timestamp_gt: endTimestamp - 3600 * 24,
            timestamp_lte: endTimestamp,
          },
          graphRequestHeaders?.[chain],
        )
          .catch(handle200Errors)
          .catch((e) =>
            console.error(
              `GraphFetchError: Failed to get daily volume on ${chain} with graph ${
                graphUrls[chain]
              }: ${wrapGraphError(e).message}`,
            ),
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
        graphResDailyVolume = await request(graphUrls[chain], dailyVolumeQuery, { id }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`GraphFetchError: Failed to get daily volume on ${chain} with graph ${graphUrls[chain]}: ${wrapGraphError(e).message}`))
        dailyVolume = graphResDailyVolume?.[graphFieldsDailyVolume.factory]?.[graphFieldsDailyVolume.field]
        if (!graphResDailyVolume || !dailyVolume) {
          console.info("Attempting with alternative query...")
          graphResDailyVolume = await request(graphUrls[chain], alternativeDailyQuery, { timestamp: getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000)) }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`Failed to get alternative daily volume on ${chain} with graph ${graphUrls[chain]}: ${wrapGraphError(e).message}`))
          const factory = graphFieldsDailyVolume.factory.toLowerCase().charAt(graphFieldsDailyVolume.factory.length - 1) === 's' ? graphFieldsDailyVolume.factory : `${graphFieldsDailyVolume.factory}s`
          dailyVolume = graphResDailyVolume?.[factory].reduce((p: any, c: any) => p + Number(c[graphFieldsDailyVolume.field]), 0);
        }
      }

      // TOTAL VOLUME
      const graphResTotalVolume = await request(graphUrls[chain], totalVolumeQuery, { block }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`GraphFetchError: Failed to get total volume on ${chain} with graph ${graphUrls[chain]}: ${wrapGraphError(e).message}`));
      const totalVolume = graphResTotalVolume?.[graphFieldsTotalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalVolume.field]), 0)?.toString()

      // DAILY FEES
      const graphResDailyFees = await request(graphUrls[chain], dailyFeesQuery, { id }, graphRequestHeaders?.[chain]).catch(_e => {
        if (dailyVolume === undefined || feesPercent?.Fees === undefined)
          console.error(`Unable to get daily fees on ${chain} from graph.`)
      });
      const dailyFees = graphResDailyFees?.[graphFieldsDailyFees.factory]?.[graphFieldsDailyFees.field]

      // TOTAL FEES
      const graphResTotalFees = await request(graphUrls[chain], totalFeesQuery, { id }, graphRequestHeaders?.[chain]).catch(_e => {
        if (totalVolume === undefined || feesPercent?.Fees === undefined)
          console.error(`Unable to get total fees on ${chain} from graph.`)
      });
      const totalFees = graphResTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

      const response: FetchResultGeneric = {
        timestamp: endTimestamp,
        block,
        totalVolume,
        dailyVolume,
        dailyFees,
        totalFees
      };

      if (feesPercent) {
        const feeBase = feesPercent.type
        const dailyBase = feeBase === 'volume' ? dailyVolume : dailyFees
        const totalBase = feeBase === 'volume' ? totalVolume : totalFees
        Object.entries(feesPercent).forEach(([feeType, feePercentType]) => {
          if (typeof feePercentType !== "number") return
          if (dailyBase !== undefined && response[`daily${feeType}`] === undefined)
            response[`daily${feeType}`] = new BigNumber(dailyBase).multipliedBy(feePercentType / 100).toString()
          if (totalBase && response[`total${feeType}`] === undefined)
            response[`total${feeType}`] = new BigNumber(totalBase).multipliedBy(feePercentType / 100).toString()
        })
      }
      return response
    };
  };
}

function univ2DimensionAdapter(params: IGetChainVolumeParams, meta: BaseAdapter[string]['meta']) {
  const graphs = getGraphDimensions(params);

  const adapter: SimpleAdapter = {
    adapter: Object.keys(params.graphUrls).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: graphs(chain as Chain),
          start: getStartTimestamp({
            endpoints: params.graphUrls,
            chain,
            volumeField: params.dailyVolume?.field,
            dailyDataField: params.dailyVolume?.factory + "s",
            dateField: params.dailyVolume?.dateField,
          }),
          meta,
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
  getGraphDimensions,
  univ2DimensionAdapter,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
};
