import { Chain } from "../adapters/types";
import { request, gql } from "graphql-request";
import { BaseAdapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { SimpleAdapter } from "../adapters/types";
import { DEFAULT_DATE_FIELD } from "./getStartTimestamp";
import { Balances } from "@defillama/sdk";


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
              graphQueryYesterdayTotalVolumeVariables["id"] = id-1
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
        dailyVolumeValue = graphResDaily ? graphResDaily[`${factory }`].reduce((p: any, c: any) => p + Number(c[`${dailyVolume.field}`]), 0) : undefined;
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
  hasTotalVolume = true,
  getCustomBlock = undefined,
}: IGetChainVolumeParams) {
  const totalVolumeQuery = gql`
  ${totalVolume.factory}(
    block: { number: $block }
    ) {
      ${totalVolume.field}
    }
    `;

  const graphQueryTotalVolume = gql`query get_total_volume($block: Int) { ${totalVolumeQuery} }`

  return (chain: Chain) => {
    return async (options: FetchOptions) => {
      const { endTimestamp, startTimestamp, getEndBlock, getStartBlock } = options;

      const endBlock = (await (getCustomBlock ? getCustomBlock(endTimestamp) : getEndBlock())) ?? undefined;
      const startBlock = (await (getCustomBlock ? getCustomBlock(startTimestamp) :getStartBlock())) ?? undefined;

      const graphResTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, { block: endBlock }): undefined;
      const total = graphResTotal ? graphResTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalVolume.field]), 0) : undefined;

      const graphResPrevTotal = hasTotalVolume ? await request(graphUrls[chain], graphQueryTotalVolume, { block: startBlock }) : undefined;
      const prevTotal = graphResPrevTotal ? graphResPrevTotal[totalVolume.factory]?.reduce((total: number, factory: any) => total + Number(factory[totalVolume.field]), 0) : undefined;

      let dailyVolumeValue = total - prevTotal

      return {
        dailyVolume: dailyVolumeValue,
      };
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
}: IGetChainVolumeParams & {priceToken:string}) {
  const basic = getChainVolume({graphUrls, totalVolume, dailyVolume, customDailyVolume, hasDailyVolume, hasTotalVolume, getCustomBlock})
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
  getCustomBlock = undefined,
  priceToken,
}: IGetChainVolumeParams & {priceToken:string}) {
  const basic = getChainVolume2({graphUrls, totalVolume, getCustomBlock})
  return (chain: Chain) => {
    return async (options: FetchOptions): Promise<FetchResultV2> => {
      const {
        dailyVolume,
      } = await basic(chain)(options);

      const timestamp = options.endTimestamp
      const balances = new Balances({ chain, timestamp })
      balances.add(priceToken, Number(dailyVolume).toFixed(0), { skipChain: true })

      return {
        dailyVolume: await balances.getUSDString(),
      }
    };
  };
}

function univ2Adapter({
  endpoints = {} as {[chain: string]: string},
  factoriesName = DEFAULT_TOTAL_VOLUME_FACTORY,
  dayData = DEFAULT_DAILY_VOLUME_FACTORY,
  totalVolume = DEFAULT_TOTAL_VOLUME_FIELD,
  totalVolumeFilterParams = undefined as IGetChainVolumeFilterParams[] | undefined,
  dailyVolume = DEFAULT_DAILY_VOLUME_FIELD,
  dailyVolumeTimestampField = DEFAULT_DATE_FIELD,
  hasTotalVolume = true,
  hasDailyVolume = undefined as boolean|undefined,
  gasToken = null as string|null
}){
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
  return async (_a:any, _b:any, options: FetchOptions) => {
    return graphs(options.chain)(_a, _b, options)
  }
}

function univ2Adapter2({
  endpoints = {} as {[chain: string]: string},
  factoriesName = DEFAULT_TOTAL_VOLUME_FACTORY,
  totalVolume = DEFAULT_TOTAL_VOLUME_FIELD,
  gasToken = null as string|null,
}){
  const graphs = (gasToken === null ? getChainVolume2 : getChainVolumeWithGasToken2 as typeof getChainVolume2)({
    graphUrls: endpoints,
    totalVolume: {
      factory: factoriesName,
      field: totalVolume
    },
    priceToken: gasToken
  } as any);
  return async (options: FetchOptions) => {
    return graphs(options.chain)(options)
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
};
