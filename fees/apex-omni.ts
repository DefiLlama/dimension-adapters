import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL"

// const BUYBACK_VAULT_ADDR = '0x18A45C46840CF830e43049C8fe205CA05B43527B';
// const TOKEN_APEX = ADDRESSES.arbitrum.APEX;

interface IFees {
  feeOfDate: string;
}

const fetch = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${options.startOfDay * 1000}`;
  const feesData: IFees = (await httpGet(url)).data;
  if (typeof feesData?.feeOfDate !== "string") throw new Error("No fee data");

  // 50% fees are revenue
  const fee = Number(feesData.feeOfDate)
  const revenue = fee * 0.5
  const supplySideRevenue = fee * 0.5
  
  return {
    dailyFees: fee,
    dailyRevenue: revenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: revenue,
    dailySupplySideRevenue: supplySideRevenue,
  }
}

// tracks APEX token buybacks
// const fetchRevenue = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
//   // Buybacks are not automated, so we have to track this address for any inflows
//   const dailyHoldersRevenue = await addTokensReceived({ options, token: TOKEN_APEX, target: BUYBACK_VAULT_ADDR})

//   return {
//     dailyRevenue: dailyHoldersRevenue,
//     dailyHoldersRevenue
//   }
// }

const info = {
  methodology: {
    Fees: "All fees collected from trading on APEX Omni exchange.",
    Revenue: "50% of fees used to buy back APEX tokens.",
    ProtocolRevenue: "No protocol revenue, all revenue goes to token holders via buybacks.",
    HoldersRevenue: "50% of fees used to buy back APEX tokens on a weekly basis on random days of the week.",
    SupplySideRevenue: "50% of fees distributed protocol vaults depositors.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: info.methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-08-31',
    },
    // [CHAIN.ARBITRUM]: {
    //   fetch: fetchRevenue,
    //   start: '2025-10-02',
    // }
  }
}

export default adapter;
