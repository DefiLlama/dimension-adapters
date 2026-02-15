import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL"
import { METRIC } from "../helpers/metrics";

// const BUYBACK_VAULT_ADDR = '0x18A45C46840CF830e43049C8fe205CA05B43527B';
// const TOKEN_APEX = ADDRESSES.arbitrum.APEX;

interface IFees {
  feeOfDate: string;
}

const fetch = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${options.startOfDay * 1000}`;
  const feesData: IFees = (await httpGet(url)).data;
  if (typeof feesData?.feeOfDate !== "string") throw new Error("No fee data");

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(Number(feesData.feeOfDate), METRIC.TRADING_FEES);

  // 50% to holders via buybacks, 50% to vault depositors
  const dailyHoldersRevenue = dailyFees.clone(0.5, METRIC.TOKEN_BUY_BACK);
  const dailySupplySideRevenue = dailyFees.clone(0.5, "Vault depositor rewards");

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
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

const methodology = {
  Fees: "All fees collected from trading on APEX Omni exchange.",
  Revenue: "50% of fees used to buy back APEX tokens.",
  ProtocolRevenue: "No protocol revenue, all revenue goes to token holders via buybacks.",
  HoldersRevenue: "50% of fees used to buy back APEX tokens on a weekly basis on random days of the week.",
  SupplySideRevenue: "50% of fees distributed to protocol vaults depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "All fees collected from perpetual futures trading on APEX Omni exchange, including open/close position fees and margin fees",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "50% of trading fees allocated to weekly APEX token buybacks for token holders",
  },
  SupplySideRevenue: {
    "Vault depositor rewards": "50% of trading fees distributed to users who deposit assets into protocol vaults",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  breakdownMethodology,
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
