import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL"
import { METRIC } from "../helpers/metrics";
import ADDRESSES from '../helpers/coreAssets.json'
import { addTokensReceived } from "../helpers/token";

const BUYBACK_VAULT_ADDR = '0x18A45C46840CF830e43049C8fe205CA05B43527B';
const TOKEN_APEX = ADDRESSES.arbitrum.APEX;

interface IFees {
  feeOfDate: string;
}

const fetch = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${options.startOfDay * 1000}`;
  const feesData: IFees = (await httpGet(url)).data;
  if (typeof feesData?.feeOfDate !== "string") throw new Error("No fee data");
  return {
    dailyFees: feesData?.feeOfDate,
  }
}

// tracks APEX token buybacks
const fetchRevenue = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  // Buybacks are not automated, so we have to track this address for any inflows
  const dailyHoldersRevenue = await addTokensReceived({ options, token: TOKEN_APEX, target: BUYBACK_VAULT_ADDR})

  return {
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
