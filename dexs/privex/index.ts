import { formatEther } from "ethers";
import { FetchOptions, SimpleAdapter} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";
// import { httpGet } from "../../utils/fetchURL"

interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
}

// const API = 'https://app.prvx.io/api/intxinfo/v1/analytics/platform/timeline/trades'

const chainConfig = {
  [CHAIN.BASE]: {
    chainId: 8453,
    start: '2024-09-08', // October 8, 2024
    accountSource: '0x921dd892d67aed3d492f9ad77b30b60160b53fe1',
    endpoint: 'https://api.goldsky.com/api/public/project_cmae5a5bs72to01xmbkb04v80/subgraphs/privex-analytics/1.0.1/gn',
  },
  [CHAIN.COTI]: {
    chainId: 2632500,
    start: '2025-01-01', // January 1, 2025
    accountSource: '0xbf318724218ced9a3ff7cfc642c71a0ca1952b0f',
    endpoint: 'https://graph-symmio.prvx.io/subgraphs/name/coti-perps-analytics',
  },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = ` 
    query stats {
      dailyHistories(
        where: { timestamp_gte: "${options.fromTimestamp}", timestamp_lte: "${options.toTimestamp}", accountSource: "${chainConfig[options.chain].accountSource}" }
      ) {
        timestamp
        platformFee
        accountSource
        tradeVolume
      }
    }
  `
  const response: IGraphResponse = await request(chainConfig[options.chain].endpoint, query);

  const dailyVolumeBigInt = response.dailyHistories.reduce((sum, data) => sum + BigInt(data.tradeVolume), BigInt(0));
  const dailyFeesBigInt = response.dailyHistories.reduce((sum, data) => sum + BigInt(data.platformFee), BigInt(0));
  const dailyFees = formatEther(dailyFeesBigInt);
  const dailyVolume = formatEther(dailyVolumeBigInt * 2n);
  
  // const dataDay = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  // const dataItems = await httpGet(API)
  // const dataItem = dataItems.find((i: any) => i.chainId === chainConfig[options.chain].chainId && i.date === dataDay)
  // if (!dataItem) {
  //   throw Error(`can not find data for date ${dataDay}`)
  // }
  
  // const dailyVolume = Number(Number(dataItem.volume_close) + Number(dataItem.volume_open)) * 2
  // const dailyFees = Number(dataItem.fees)

  return { 
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Platform fees collected by PriveX from derivatives trading activities",
  Revenue: "All platform fees collected represent protocol revenue",
  ProtocolRevenue: "All platform fees collected represent protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  adapter: chainConfig
};

export default adapter;