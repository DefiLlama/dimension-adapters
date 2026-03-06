import { Chain } from "../adapters/types";
import { request, gql } from "graphql-request";
import {  FetchOptions, FetchResultV2 } from "../adapters/types";
import BigNumber from "bignumber.js";

interface IGetChainFeeParams {
  totalFees?: number,
  protocolFees?: number,
  revenue?: number,
  userFees?: number,
  supplySideRevenue?: number,
  holdersRevenue?: number,
}

function handleFeeConfig(feeConfig: IGetChainFeeParams, response: FetchResultV2) {
  const chainDailyVolume = response.dailyVolume as number;
  if (chainDailyVolume !== undefined) {
    if (feeConfig.totalFees !== undefined)
      response["dailyFees"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.totalFees).toString()
    if (feeConfig.userFees !== undefined)
      response["dailyUserFees"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.userFees).toString()
    if (feeConfig.revenue !== undefined)
      response["dailyRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.revenue).toString()
    if (feeConfig.holdersRevenue !== undefined)
      response["dailyHoldersRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.holdersRevenue).toString()
    if (feeConfig.supplySideRevenue !== undefined)
      response["dailySupplySideRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.supplySideRevenue).toString()
    if (feeConfig.protocolFees !== undefined)
      response["dailyProtocolRevenue"] = new BigNumber(chainDailyVolume).multipliedBy(feeConfig.protocolFees).toString()
  }
  return response
}

const getUniqStartOfTodayTimestamp = (date = new Date()) => {
  var date_utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
  var startOfDay = new Date(date_utc);
  var timestamp = startOfDay.getTime() / 1000;
  return Math.floor(timestamp / 86400) * 86400;
};

const DEFAULT_TOTAL_VOLUME_FACTORY = "uniswapFactories";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DEFAULT_DAILY_VOLUME_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";
const DEFAULT_TOTAL_FEES_FACTORY = "factories";
const DEFAULT_TOTAL_FEES_FIELD = "totalFeesUSD";

const DEFAULT_DAILY_FEES_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_FEES_FIELD = "feesUSD";

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string
  },
  totalVolume: {
    factory: string,
    field: string,
  },
  totalFeesField?: string,
  hasTotalVolume?: boolean
  getCustomBlock?: (timestamp: number) => Promise<number>
}

function getChainVolume2({
  graphUrls,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  totalFeesField,
  hasTotalVolume = true,
  getCustomBlock = undefined,
}: IGetChainVolumeParams) {
  const totalVolumeQuery = gql`
  ${totalVolume.factory}(
    block: { number: $block }
    ) {
      ${totalVolume.field}
      ${totalFeesField ? totalFeesField : ''}
    }
    `;

  const graphQueryTotalVolume = gql`query get_total_volume($block: Int) { ${totalVolumeQuery} }`

  return (chain: Chain) => {
    return async (options: FetchOptions) => {
      const { endTimestamp, startTimestamp, getEndBlock, getStartBlock } = options;

      const endBlock = (await (getCustomBlock ? getCustomBlock(endTimestamp) : getEndBlock())) ?? undefined;
      const startBlock = (await (getCustomBlock ? getCustomBlock(startTimestamp) : getStartBlock())) ?? undefined;

      const graphResTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, { block: endBlock }) : undefined;
      const total = graphResTotal ? graphResTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalVolume.field]), 0) : undefined;
      const totalFees = totalFeesField && graphResTotal ? graphResTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalFeesField]), 0) : undefined;

      const graphResPrevTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, { block: startBlock }) : undefined;
      const prevTotal = graphResPrevTotal ? graphResPrevTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalVolume.field]), 0) : undefined;
      const prevTotalFees = totalFeesField && graphResPrevTotal ? graphResPrevTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalFeesField]), 0) : undefined;

      let dailyVolumeValue = total - prevTotal

      const response: any = {
        dailyVolume: dailyVolumeValue,
      }
      if (totalFeesField)
        response.dailyFees = totalFees - prevTotalFees
      return response
    };
  };
}

function univ2Adapter2({
  endpoints = {} as { [chain: string]: string },
  factoriesName = DEFAULT_TOTAL_VOLUME_FACTORY,
  totalVolume = DEFAULT_TOTAL_VOLUME_FIELD,
  totalFeesField = null as string | null,
  feeConfig = undefined as IGetChainFeeParams | undefined,
}) {
  const graphs = getChainVolume2({
    graphUrls: endpoints,
    totalVolume: {
      factory: factoriesName,
      field: totalVolume
    },
    totalFeesField,
  } as any);
  return async (options: FetchOptions) => {
    const response = await graphs(options.chain)(options);
    if (feeConfig) {
      handleFeeConfig(feeConfig, response);
    }
    return response;
  }
}

export {
  getUniqStartOfTodayTimestamp,
  getChainVolume2,
  univ2Adapter2,
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_FEES_FACTORY,
  DEFAULT_TOTAL_FEES_FIELD,
  DEFAULT_DAILY_FEES_FACTORY,
  DEFAULT_DAILY_FEES_FIELD,
};
