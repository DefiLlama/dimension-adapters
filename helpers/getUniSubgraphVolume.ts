import { Chain } from "../adapters/types";
import { request, gql } from "graphql-request";
import {  FetchOptions, FetchResultV2 } from "../adapters/types";
import { DEFAULT_DATE_FIELD } from "./getStartTimestamp";
import { Balances } from "@defillama/sdk";
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

const getUniswapDateId = (date?: Date) => getUniqStartOfTodayTimestamp(date) / 86400;

const DEFAULT_TOTAL_VOLUME_FACTORY = "uniswapFactories";
const DEFAULT_TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DEFAULT_DAILY_VOLUME_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";
const DEFAULT_DAILY_DATE_FIELD = "date";
const DEFAULT_TOTAL_FEES_FACTORY = "factories";
const DEFAULT_TOTAL_FEES_FIELD = "totalFeesUSD";

const DEFAULT_DAILY_FEES_FACTORY = "uniswapDayData";
const DEFAULT_DAILY_FEES_FIELD = "feesUSD";

interface IGetChainVolumeFilterParams {
  name: string,
  type: string
}

interface IGetChainVolumeParams {
  graphUrls: {
    [chains: string]: string
  },
  totalVolume: {
    factory: string,
    field: string,
    filterParams?: IGetChainVolumeFilterParams[],
  },
  dailyVolume?: {
    factory: string,
    field: string,
    dateField?: string,
  },
  totalFeesField?: string,
  customDailyVolume?: string,
  hasDailyVolume?: boolean
  hasTotalVolume?: boolean
  getCustomBlock?: (timestamp: number) => Promise<number>
}

function getChainVolume({
  graphUrls,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: DEFAULT_DAILY_DATE_FIELD
  },
  customDailyVolume = undefined,
  hasDailyVolume = false,
  hasTotalVolume = true,
  getCustomBlock = undefined,
}: IGetChainVolumeParams) {
  const totalVolumeQuery = totalVolume.filterParams
    ? gql`query get_total_volume(${totalVolume.filterParams.map(item => `$${item.name}: ${item.type}`).join(', ')}) { 
    ${totalVolume.factory}(
      where: {${totalVolume.filterParams.map(item => `${item.name}: $${item.name}`).join(', ')}}
      ) {
        ${totalVolume.field}
      }
     }
    ` : gql`query get_total_volume($block: Int) { 
    ${totalVolume.factory}(
      block: { number: $block }
      ) {
        ${totalVolume.field}
      }
     }
    `;

  const dailyVolumeQuery =
    customDailyVolume ||
    gql`
    ${dailyVolume.factory} (id: $id) {
          ${dailyVolume.field}
      }`;

  const alternativeDaily = (timestamp: number) => gql`{
      ${dailyVolume.factory}s(where: {${dailyVolume.dateField}: ${timestamp}}) {
          ${dailyVolume.dateField}
          ${dailyVolume.field}
      }
  }`;

  const graphQueryTotalVolume = gql`${hasTotalVolume ? totalVolumeQuery : ""}`
  const graphQueryDailyVolume = gql`${hasDailyVolume ? `query get_daily_volume($id: Int) { ${dailyVolumeQuery} }` : ""}`;

  return (chain: Chain) => {
    return async (_a: any, _b: any, options: FetchOptions) => {
      const { endTimestamp, getEndBlock, getFromBlock, getToBlock } = options;
      const customBlockFunc = getCustomBlock ? getCustomBlock : getEndBlock;
      const block = (await customBlockFunc(endTimestamp)) ?? undefined;
      const id = getUniswapDateId(new Date(endTimestamp * 1000));
      let graphQueryTodayTotalVolumeVariables: { [key: string]: any } = {}
      let graphQueryYesterdayTotalVolumeVariables: { [key: string]: any } = {}
      if (totalVolume.filterParams) {
        totalVolume.filterParams.forEach((item) => {
          switch (item.name) {
            case "id":
              graphQueryTodayTotalVolumeVariables["id"] = id;
              graphQueryYesterdayTotalVolumeVariables["id"] = id - 1
            default:
          }
        });
      } else {
        graphQueryTodayTotalVolumeVariables = { block }
      }

      const graphResTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, graphQueryTodayTotalVolumeVariables) : undefined;
      let graphResDaily = hasDailyVolume ? await request(graphUrls[chain], graphQueryDailyVolume, { id }) : undefined;
      let dailyVolumeValue = graphResDaily ? graphResDaily[dailyVolume.factory]?.[dailyVolume.field] : undefined
      if (hasDailyVolume && !dailyVolumeValue) {
        graphResDaily = await request(graphUrls[chain], alternativeDaily(getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))));
        const factory = dailyVolume.factory.toLowerCase().charAt(dailyVolume.factory.length - 1) === 's' ? dailyVolume.factory : `${dailyVolume.factory}s`
        dailyVolumeValue = graphResDaily ? graphResDaily[`${factory}`].reduce((p: any, c: any) => p + Number(c[`${dailyVolume.field}`]), 0) : undefined;
      }
      if (!hasDailyVolume) {
        const fromBlock = await getFromBlock()
        const toBlock = await getToBlock();
        if (!totalVolume.filterParams) {
          graphQueryTodayTotalVolumeVariables["block"] = toBlock;
          graphQueryYesterdayTotalVolumeVariables["block"] = fromBlock
        }
        const [yesterdayResult, todayResult] = await Promise.all([request(graphUrls[chain], graphQueryTotalVolume, graphQueryYesterdayTotalVolumeVariables), request(graphUrls[chain], graphQueryTotalVolume, graphQueryTodayTotalVolumeVariables)])
        const todayVolume = todayResult[totalVolume.factory].reduce((p: any, c: any) => p + Number(c[`${totalVolume.field}`]), 0)
        const yesterdayVolume = yesterdayResult[totalVolume.factory].reduce((p: any, c: any) => p + Number(c[`${totalVolume.field}`]), 0)
        const volume24H = todayVolume - yesterdayVolume;
        dailyVolumeValue = volume24H;
      }

      return {
        dailyVolume: dailyVolumeValue,
      };
    };
  };
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

function getChainVolumeWithGasToken({
  graphUrls,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: 'totalVolumeETH',
  },
  dailyVolume = {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: 'dailyVolumeETH',
    dateField: DEFAULT_DAILY_DATE_FIELD
  },
  customDailyVolume = undefined,
  hasDailyVolume = true,
  hasTotalVolume = true,
  getCustomBlock = undefined,
  priceToken,
}: IGetChainVolumeParams & { priceToken: string }) {
  const basic = getChainVolume({ graphUrls, totalVolume, dailyVolume, customDailyVolume, hasDailyVolume, hasTotalVolume, getCustomBlock })
  return (chain: Chain) => {
    return async (_a: any, _b: any, options: FetchOptions) => {
      const {
        dailyVolume,
      } = await basic(chain)(_a, _b, options);

      const timestamp = options.endTimestamp
      const balances = new Balances({ chain, timestamp })
      balances.add(priceToken, Number(dailyVolume).toFixed(0), { skipChain: true })

      return {
        dailyVolume: await balances.getUSDString()
      }
    };
  };
}

function getChainVolumeWithGasToken2({
  graphUrls,
  totalVolume = {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: 'totalVolumeETH',
  },
  totalFeesField,
  getCustomBlock = undefined,
  priceToken,
}: IGetChainVolumeParams & { priceToken: string }) {
  const basic = getChainVolume2({ graphUrls, totalVolume, totalFeesField, getCustomBlock })
  return (chain: Chain) => {
    return async (options: FetchOptions): Promise<FetchResultV2> => {
      const {
        dailyVolume,
        dailyFees,
      } = await basic(chain)(options);

      const balances = options.createBalances()
      balances.add(priceToken, Number(dailyVolume).toFixed(0), { skipChain: true })
      let dailyFeesObj = options.createBalances()
      if (totalFeesField)
        dailyFeesObj.add(priceToken, Number(dailyFees).toFixed(0), { skipChain: true })

      const response: any = {
        dailyVolume: balances,
      }
      if (totalFeesField)
        response.dailyFees = dailyFeesObj
      return response
    };
  };
}

function univ2Adapter({
  endpoints = {} as { [chain: string]: string },
  factoriesName = DEFAULT_TOTAL_VOLUME_FACTORY,
  dayData = DEFAULT_DAILY_VOLUME_FACTORY,
  totalVolume = DEFAULT_TOTAL_VOLUME_FIELD,
  totalVolumeFilterParams = undefined as IGetChainVolumeFilterParams[] | undefined,
  dailyVolume = DEFAULT_DAILY_VOLUME_FIELD,
  dailyVolumeTimestampField = DEFAULT_DATE_FIELD,
  hasTotalVolume = true,
  hasDailyVolume = undefined as boolean | undefined,
  gasToken = null as string | null
}) {
  const graphs = (gasToken === null ? getChainVolume : getChainVolumeWithGasToken as typeof getChainVolume)({
    graphUrls: endpoints,
    hasTotalVolume,
    totalVolume: {
      factory: factoriesName,
      field: totalVolume,
      filterParams: totalVolumeFilterParams
    },
    dailyVolume: {
      factory: dayData,
      field: dailyVolume,
      dateField: dailyVolumeTimestampField
    },
    hasDailyVolume,
    priceToken: gasToken
  } as any);
  return async (_a: any, _b: any, options: FetchOptions) => {
    return graphs(options.chain)(_a, _b, options)
  }
}

function univ2Adapter2({
  endpoints = {} as { [chain: string]: string },
  factoriesName = DEFAULT_TOTAL_VOLUME_FACTORY,
  totalVolume = DEFAULT_TOTAL_VOLUME_FIELD,
  totalFeesField = null as string | null,
  gasToken = null as string | null,
  feeConfig = undefined as IGetChainFeeParams | undefined,
}) {
  const graphs = (gasToken === null ? getChainVolume2 : getChainVolumeWithGasToken2 as typeof getChainVolume2)({
    graphUrls: endpoints,
    totalVolume: {
      factory: factoriesName,
      field: totalVolume
    },
    totalFeesField,
    priceToken: gasToken
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
  getChainVolume,
  getChainVolume2,
  getChainVolumeWithGasToken,
  getChainVolumeWithGasToken2,
  univ2Adapter,
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
