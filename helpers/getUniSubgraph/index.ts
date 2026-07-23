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
    let endpoint = graphUrls[chain]
    endpoint = sdk.graph.modifyEndpoint(endpoint)


    let dailyVolume: any;
    const graphResTotalVolume = await request(endpoint, totalVolumeQuery, { block: endBlock }, graphRequestHeaders?.[chain]);
    const totalVolume = graphResTotalVolume?.[graphFieldsTotalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalVolume.field]), 0)?.toString()

    // PREV TOTAL VOLUME
    const graphResPrevTotalVolume = await request(endpoint, totalVolumeQuery, { block: startBlock }, graphRequestHeaders?.[chain]);
    const prevTotalVolume = graphResPrevTotalVolume?.[graphFieldsTotalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalVolume.field]), 0)?.toString()
    dailyVolume = totalVolume - prevTotalVolume

    // TOTAL FEES

    const graphResTotalFees = await request(endpoint, totalFeesQuery, { block: endBlock }, graphRequestHeaders?.[chain]).catch(_e => {
      if (totalVolume === undefined || feesPercent?.Fees === undefined)
        console.error(`Unable to get total fees on ${chain} from graph.`)
    });
    const totalFees = graphResTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    // PREV TOTAL FEES
    const graphResPrevTotalFees = await request(endpoint, totalFeesQuery, { block: startBlock }, graphRequestHeaders?.[chain]).catch(_e => {
      if (totalVolume === undefined || feesPercent?.Fees === undefined)
        console.error(`Unable to get total fees on ${chain} from graph.`)
    });
    const prevTotalFees = graphResPrevTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    const dailyFees = (totalFees == undefined && prevTotalFees == undefined) ? undefined : totalFees - prevTotalFees

    // const graphResTotalFees = await request(endpoint, totalFeesQuery, { block: endBlock }, graphRequestHeaders?.[chain]);
    // const totalFees = graphResTotalFees?.[graphFieldsTotalFees.factory]?.reduce((total: number, factory: any) => total + Number(factory[graphFieldsTotalFees.field]), 0)

    // // PREV TOTAL FEES
    // const graphResPrevTotalFees = await request(endpoint, totalFeesQuery, { block: startBlock }, graphRequestHeaders?.[chain]);
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
