import { Adapter, Fetch, FetchResultFees } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDune } from '../../helpers/dune';

const totalFee = 9.5;
const strategistFee = 0.5;
const callFee = 0.01;
const revenueFee = totalFee - strategistFee - callFee;
const holderShare = 36;
const protocolShare = 64;

function getDay(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

interface IRevenue {
  day: string;
  arbitrum: number;
  base: number;
  polygon: number;
  avalanche: number;
  fantom: number;
  optimism: number;
  BNB: number;
  ethereum: number;
  linea: number;
}

const fetch = (chain: Exclude<keyof IRevenue, 'day'>): Fetch => {
  return async (timestamp, _, {startOfDay}): Promise<FetchResultFees> => {
    const endTimestamp = startOfDay + 86400;
    const allRevenue: IRevenue[] = (await queryDune('3594948', {endTimestamp}));
    const day = getDay(timestamp);
    const entry = allRevenue.find(r => r.day === day);

    if (!entry) {
      throw new Error(`No fees found for ${day}`);
    }

    const dailyRevenue = entry[chain] || 0;
    const dailyFees = dailyRevenue * (totalFee / revenueFee);
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: `${dailyRevenue * (protocolShare/100)}`,
      dailyHoldersRevenue: `${dailyRevenue * (holderShare/100)}`,
      timestamp,
    };
  };
};

const methodology = {
  Fees: `${totalFee}% of each harvest is charged as a performance fee`,
  Revenue: `All fees except for ${strategistFee}% to strategist and variable harvest() call fee are revenue`,
  HoldersRevenue: `${holderShare}% of revenue is distributed to holders who stake`,
  ProtocolRevenue: `${protocolShare}% of revenue is distributed to the treasury`,
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch('arbitrum'),
      start: 1693958400, // 2023-09-06
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
   [CHAIN.BASE]: {
      fetch: fetch('base'),
      start: 1692921600, // 2023-08-25
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: fetch('polygon'),
      start: 1693958400, // 2023-09-06
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: fetch('avalanche'),
      start: 1693958400, // 2023-09-06
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: fetch('fantom'),
      start: 1692921600, // 2023-08-25
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch('optimism'),
      start: 1692921600, // 2023-08-25
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: fetch('BNB'),
      start: 1692921600, // 2023-08-25
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch('ethereum'),
      start: 1698105600, // 2023-10-24
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
    [CHAIN.LINEA]: {
      fetch: fetch('linea'),
      start: 1710028800, // 2024-03-10
      runAtCurrTime: false,
      meta: {
        methodology
      }
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;
