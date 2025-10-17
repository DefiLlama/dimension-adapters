import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date"
import { httpGet } from "../utils/fetchURL"
import { METRIC } from "../helpers/metrics";
import ADDRESSES from '../helpers/coreAssets.json'

const BUYBACK_VAULT_ADDR = '0x18A45C46840CF830e43049C8fe205CA05B43527B';
const TOKEN_APEX = ADDRESSES.arbitrum.APEX;

interface IFees {
  feeOfDate: string;
}

const fetch = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay) * 1000;
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${todaysTimestamp}`;
  const feesData: IFees = (await httpGet(url, { timeout: 10000 })).data;
  const dailyFees = feesData?.feeOfDate || '0';
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

// tracks APEX token buybacks
const fetchRevenue = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyHoldersRevenue = options.createBalances();

  // Buybacks are not automated, so we have to track this address for any inflows
  const transferEvents = await options.getLogs({
    target: TOKEN_APEX,
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  });
  transferEvents.forEach((log: any) => {
    if (log.to.toLowerCase() === BUYBACK_VAULT_ADDR.toLowerCase()) {
        dailyHoldersRevenue.add(TOKEN_APEX, log.value, METRIC.TOKEN_BUY_BACK);
    }
  });
  return {
    dailyFees: 0,
    dailyUserFees: 0,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue
  }
}

const info = {
  methodology: {
    Fees: "All fees collected from trading on APEX Omni exchange.",
    Revenue: "50-90% of fees used to buy back APEX tokens.",
    HoldersRevenue: "50-90% of fees used to buy back APEX tokens on a weekly basis on random days of the week.",
  },
  breakdownMethodology: {
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '50-90% of fees used to buy back APEX tokens on a weekly basis on random days of the week.',
    },
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: info.methodology,
  breakdownMethodology: info.breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-08-31',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchRevenue,
      start: '2025-10-02',
    }
  }
}

export default adapter;
