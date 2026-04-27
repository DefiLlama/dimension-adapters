import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { sleep } from "../../utils/utils";

interface IResponse {
  daily: any[];
  allTime: any;
}

const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";

const mapChainId: Record<string, string> = {
  [CHAIN.ETHEREUM]: '1',
  [CHAIN.OPTIMISM]: '10',
  [CHAIN.BSC]: '56',
  [CHAIN.POLYGON]: '137',
  [CHAIN.FANTOM]: '250',
  [CHAIN.POLYGON_ZKEVM]: '1101',
  [CHAIN.BASE]: '8453',
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.AVAX]: '43114',
}

const prefetch = async (_: any) => {
  const headers: any = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "upgrade-insecure-requests": "1",
    "referrerPolicy": "strict-origin-when-cross-origin",
  };

  // sometime paraswap api return unknown 500 error
  // need to retry if it failed
  for (let i = 0; i < 5; i++) {
    try {
      return await httpGet(feesMMURL, { headers });
    } catch(e: any) {
      if (i === 4) {
        throw e;
      }
    }

    await sleep(5000); // sleep 5 secs for next try
  }

}

const fetch = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const chain = options.chain;
  if (chain == CHAIN.FANTOM && timestamp > 1744416000) return {} as FetchResult; // fantom delisted at 2025-04-12
  const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
  const response: IResponse = options.preFetchedResults || [];
  const dailyResultFees: any[] = response.daily;

  const [dailyVolume, partnerRev, protocolRev]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
    .map(([_, data]: any) => data[mapChainId[chain]]).flat()

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  dailyFees.addUSDValue((partnerRev || 0) + (protocolRev || 0), 'Token Swap Fees');
  dailySupplySideRevenue.addUSDValue(partnerRev || 0, 'Fees To Partners');
  
  const revenue = protocolRev || 0;
  const revenueToVelora = revenue * 0.85;
  const revenueToDAO = revenue * 0.15 * 0.8;
  const revenueToStakers = revenue * 0.15 * 0.2;
  
  dailyRevenue.addUSDValue(revenueToVelora, 'Fees To Velora Foundation');
  dailyRevenue.addUSDValue(revenueToDAO, 'Fees To Velora DAO');
  dailyRevenue.addUSDValue(revenueToStakers, 'Fees To Velora Token Stakers');
  
  dailyProtocolRevenue.addUSDValue(revenueToVelora, 'Fees To Velora Foundation');
  dailyProtocolRevenue.addUSDValue(revenueToDAO, 'Fees To Velora DAO');
  
  dailyHoldersRevenue.addUSDValue(revenueToStakers, 'Fees To Velora Token Stakers');

  return {
    dailyVolume: dailyVolume || 0,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 1,

  start: '2022-03-22',
  chains: Object.keys(mapChainId),
  fetch,
  prefetch,
  methodology: {
    Fees: "All trading fees paid by users",
    UserFees: "All trading fees paid by users",
    Revenue: "Share of 80% trading fees to Velora, DAO, and token stakers.",
    ProtocolRevenue: "Trading fees shared to Velora and DAO.",
    HoldersRevenue: "Trading fees to stakers as part of PSP 2.0 staking rewards.",
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Users pay flat fee 0.15% while trading using Velora.',
    },
    Revenue: {
      'Fees To Velora Foundation': 'Share of 85% swap fees to Velora Foudation.',
      'Fees To Velora DAO': 'Share of 80% from 15% total swap fees to Velora DAO.',
      'Fees To Velora Token Stakers': 'Share of 20% from 15% total swap fees to Velora Token Stakers.',
    },
    ProtocolRevenue: {
      'Fees To Velora Foundation': 'Share of 85% swap fees to Velora Foudation.',
      'Fees To Velora DAO': 'Share of 80% from 15% total swap fees to Velora DAO.',
    },
    HoldersRevenue: {
      'Fees To Velora Token Stakers': 'Share of 20% from 15% total swap fees to Velora Token Stakers.',
    },
    SupplySideRevenue: {
      'Fees To Partners': 'Fees paid to partnerships and integrators with Velora.',
    },
  }
}

export default adapter;
