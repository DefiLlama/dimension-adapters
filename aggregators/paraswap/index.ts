import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { sleep } from "../../utils/utils";

interface IResponse {
  daily: any[];
  allTime: any;
}

// returns only the trailing 366 days (date params are ignored), keyed by chain id
const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";

const chainConfig: Record<string, { id: string; start: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { id: '1', start: '2022-03-22' },
  [CHAIN.OPTIMISM]: { id: '10', start: '2022-03-22' },
  [CHAIN.BSC]: { id: '56', start: '2022-03-22' },
  // live earlier, but the API's history only reaches back to 2025-11-05 (trailing 366 days on 2026-11-05)
  [CHAIN.XDAI]: { id: '100', start: '2025-11-05' },
  [CHAIN.UNICHAIN]: { id: '130', start: '2025-11-05' },
  [CHAIN.POLYGON]: { id: '137', start: '2022-03-22' },
  [CHAIN.FANTOM]: { id: '250', start: '2022-03-22', deadFrom: '2025-04-12' }, // delisted, last volume 2025-04-11
  [CHAIN.POLYGON_ZKEVM]: { id: '1101', start: '2022-03-22', deadFrom: '2025-07-10' }, // delisted, last volume 2025-07-09
  [CHAIN.ROBINHOOD]: { id: '4663', start: '2026-09-04' }, // first day in the API
  [CHAIN.BASE]: { id: '8453', start: '2022-03-22' },
  [CHAIN.ARBITRUM]: { id: '42161', start: '2022-03-22' },
  [CHAIN.AVAX]: { id: '43114', start: '2022-03-22' },
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

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { id } = chainConfig[options.chain];
  const response: IResponse = options.preFetchedResults;
  const day = response?.daily?.find(([time]: any) => time === options.startOfDay);
  // a day older than the API's 366-day window must not be stored as 0
  if (!day) throw new Error(`Velora API has no data for ${options.dateString}`);
  if (!day[1][id]) throw new Error(`Velora API has no ${options.chain} data for ${options.dateString}`);
  const [dailyVolume, partnerRev, protocolRev]: number[] = day[1][id];

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
  adapter: chainConfig,
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
