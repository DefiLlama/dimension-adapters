import { Chain } from "@defillama/sdk/build/general";
import { request, gql } from "graphql-request";
import { getBlock } from "../getBlock";
import { BaseAdapter, ChainBlocks, FetchResultGeneric, SimpleAdapter } from "../../adapters/types";
import { DEFAULT_DAILY_FEES_FACTORY, DEFAULT_DAILY_FEES_FIELD, DEFAULT_TOTAL_FEES_FACTORY, DEFAULT_TOTAL_FEES_FIELD } from "../getUniSubgraphFees";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp, getUniswapDateId, handle200Errors } from "./utils";
import { getStartTimestamp } from "../getStartTimestamp";

const DEFAULT_TOTAL_VOLUME_FACTORY = "uniswapFactories";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DEFAULT_DAILY_VOLUME_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";
const DEFAULT_DAILY_DATE_FIELD = "date";

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string
  },
  graphRequestHeaders?: {
    [chains: string]: RequestInit['headers']
  },
  totalVolume?: {
    factory?: string,
    field?: string
  },
  dailyVolume?: {
    factory?: string,
    field?: string,
    dateField?: string,
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
  }
}

function getGraphDimensions({
  graphUrls,
  graphRequestHeaders,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: DEFAULT_DAILY_DATE_FIELD
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
  feesPercent
}: IGetChainVolumeParams) {
  // DAILY VOLUME
  // Graph fields
  const graphFieldsDailyVolume = {
    factory: dailyVolume.factory ?? DEFAULT_DAILY_VOLUME_FACTORY,
    field: dailyVolume.field ?? DEFAULT_DAILY_VOLUME_FIELD,
    dateField: dailyVolume.dateField ?? DEFAULT_DAILY_DATE_FIELD // For alternative query
  }
  // Queries
  const dailyVolumeQuery = gql`
  query daily_volume ($id: ID!) {
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
  }
  // Queries
  const totalVolumeQuery = gql`
  query total_volume ($block: Int) {
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
    return async (timestamp: number, chainBlocks: ChainBlocks) => {
      // Get params
      const id = String(getUniswapDateId(new Date(timestamp * 1000)));
      const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
      const customBlockFunc = getCustomBlock ? getCustomBlock : chainBlocks?.[chain] ? async (_: number) => chainBlocks[chain] : getBlock
      const block = await customBlockFunc(timestamp, chain, chainBlocks).catch(e=>console.log(e.message)) ?? undefined
      // Execute queries
      // DAILY VOLUME
      let graphResDailyVolume
      graphResDailyVolume = await request(graphUrls[chain], dailyVolumeQuery, { id }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`Failed to get daily volume on ${chain} with graph ${graphUrls[chain]}: ${e.message}`))
      let dailyVolume = graphResDailyVolume?.[graphFieldsDailyVolume.factory]?.[graphFieldsDailyVolume.field]
      if (!graphResDailyVolume || !dailyVolume) {
        console.info("Attempting with alternative query...")
        graphResDailyVolume = await request(graphUrls[chain], alternativeDailyQuery, { timestamp: cleanTimestamp }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`Failed to get alternative daily volume on ${chain} with graph ${graphUrls[chain]}: ${e.message}`))
        const factory = graphFieldsDailyVolume.factory.toLowerCase().charAt(graphFieldsDailyVolume.factory.length - 1) === 's' ? graphFieldsDailyVolume.factory : `${graphFieldsDailyVolume.factory}s`
        dailyVolume = graphResDailyVolume?.[factory].reduce((p: any, c: any) => p + Number(c[graphFieldsDailyVolume.field]), 0);
      }

      // TOTAL VOLUME
      const graphResTotalVolume = await request(graphUrls[chain], totalVolumeQuery, { block }, graphRequestHeaders?.[chain]).catch(handle200Errors).catch(e => console.error(`Failed to get total volume on ${chain} with graph ${graphUrls[chain]}: ${e.message}`));
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
        timestamp,
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
            dateField: params.dailyVolume?.dateField
          }),
          meta
        }
      }
    }, {} as BaseAdapter)
  };

  return adapter;
}

export {
  getGraphDimensions,
  univ2DimensionAdapter,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
};
