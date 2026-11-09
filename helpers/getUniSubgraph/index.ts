import { request, gql } from "graphql-request";
import { FetchOptions, FetchResultGeneric, IJSON, } from "../../adapters/types";
import { DEFAULT_TOTAL_FEES_FACTORY, DEFAULT_TOTAL_FEES_FIELD } from "../getUniSubgraphVolume";
import BigNumber from "bignumber.js";
import * as sdk from '@defillama/sdk'

const DEFAULT_TOTAL_VOLUME_FACTORY = "uniswapFactories";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DEFAULT_DAILY_VOLUME_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";

const DEFAULT_BLOCK_TYPE = 'Int'

interface IGetChainVolumeFilterParams {
  name: string,
  type: string
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
  query total_volume ($startBlock: ${graphFieldsTotalVolume.blockGraphType}, $endBlock: ${graphFieldsTotalVolume.blockGraphType}) {
    start: ${graphFieldsTotalVolume.factory}(block: { number: $startBlock }) {
      ${graphFieldsTotalVolume.field}
    }
    end: ${graphFieldsTotalVolume.factory}(block: { number: $endBlock }) {
      ${graphFieldsTotalVolume.field}
    }
  }`;

  const graphFieldsTotalFees = {
    factory: totalFees.factory ?? DEFAULT_TOTAL_FEES_FACTORY,
    field: totalFees.field ?? DEFAULT_TOTAL_FEES_FIELD
  }
  const totalFeesQuery = gql`
  query total_fees ($startBlock: ${graphFieldsTotalVolume.blockGraphType}, $endBlock: ${graphFieldsTotalVolume.blockGraphType}) {
    start: ${graphFieldsTotalFees.factory}(block: { number: $startBlock }) {
      ${graphFieldsTotalFees.field}
    }
    end: ${graphFieldsTotalFees.factory}(block: { number: $endBlock }) {
      ${graphFieldsTotalFees.field}
    }
  }`;
  const sumField = (factories: any[] | undefined, field: string) => factories?.reduce((total: number, factory: any) => total + Number(factory[field]), 0)
  return async (options: FetchOptions) => {
    const { chain, endTimestamp, startTimestamp, getEndBlock, getStartBlock } = options;

    const endBlock = await (getCustomBlock ? getCustomBlock(endTimestamp) : getEndBlock());
    const startBlock = await (getCustomBlock ? getCustomBlock(startTimestamp) :getStartBlock());
    let endpoint = graphUrls[chain]
    endpoint = sdk.graph.modifyEndpoint(endpoint)


    const graphResTotalVolume = await request(endpoint, totalVolumeQuery, { startBlock, endBlock }, graphRequestHeaders?.[chain]);
    const totalVolume = sumField(graphResTotalVolume?.end, graphFieldsTotalVolume.field)
    const prevTotalVolume = sumField(graphResTotalVolume?.start, graphFieldsTotalVolume.field)
    if (totalVolume === undefined || prevTotalVolume === undefined)
      throw new Error(`The subgraph returned an incomplete cumulative volume snapshot on ${chain}`)
    const dailyVolume = totalVolume - prevTotalVolume

    const canDeriveFeesFromVolume = feesPercent?.type === 'volume' && typeof feesPercent.Fees === 'number'
    let dailyFees: number | undefined
    try {
      const graphResTotalFees = await request(endpoint, totalFeesQuery, { startBlock, endBlock }, graphRequestHeaders?.[chain])
      const totalFees = sumField(graphResTotalFees?.end, graphFieldsTotalFees.field)
      const prevTotalFees = sumField(graphResTotalFees?.start, graphFieldsTotalFees.field)

      if (totalFees === undefined || prevTotalFees === undefined)
        throw new Error('The subgraph returned an incomplete cumulative fee snapshot')

      dailyFees = totalFees - prevTotalFees
    } catch (error) {
      const message = wrapGraphError(error as Error).message
      if (!canDeriveFeesFromVolume)
        throw new Error(`Unable to get total fees on ${chain} from graph: ${message}`)

      console.error(`Unable to get total fees on ${chain} from graph; deriving fees from volume instead: ${message}`)
    }

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

function wrapGraphError(e: Error) {
  const message = (e as any).response?.errors?.[0]?.message ?? e.message;
  return new Error(shortenString(message));

  function shortenString(str: string, maxLength: number = 420) {
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  }
}

export {
  wrapGraphError,
  getGraphDimensions2,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
};
