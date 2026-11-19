import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Daily swap fees from the SUN.io open API (UTC 00:00 millisecond timestamps).
// SunSwap V2 is a Uniswap V2 fork on Tron.
// Factory: TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY (0x689abaeeed3f0bb3585773192e23224cac25dd41)
// feeTo: TPdthWzUHfepu2TEBimTFi1sBWtGYi3Ksa (SunMaker), active since 2021-12-14.
// 1/6 of the 0.3% swap fee (i.e. 0.05%) accrues to SunMaker, which converts it
// to SUN and burns it via SunBar. Source: SUN.io whitepaper.
const FEE_API = "https://openapi.sun.io/open/api/feeData";

const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_LPS = "Swap Fees To LPs";
const SWAP_FEES_TO_BUYBACK = "Swap Fees To Buyback";
const TOKEN_BUY_BACK = "Token Buy Back";

interface IResponse {
  date: number;
  fee: number | string;
}

const fetch = async (options: FetchOptions) => {
  const start = options.startOfDay * 1000;
  const dateStr = options.dateString;

  const feeRes = await httpGet(`${FEE_API}?fromDate=${dateStr}&toDate=${dateStr}&version=v2`);
  const feeList: IResponse[] = Array.isArray(feeRes?.data) ? feeRes.data : [];
  if (!feeList.length) {
    throw new Error(`sunswap-v2: no fee data returned for ${dateStr}`);
  }
  const dayItem = feeList.find((item) => item.date === start);
  if (!dayItem) {
    throw new Error(`sunswap-v2: no fee data for ${dateStr}`);
  }

  const dailyFeesNum = Number(dayItem.fee);
  if (!Number.isFinite(dailyFeesNum) || dailyFeesNum < 0) {
    throw new Error(`sunswap-v2: invalid fee data for ${dateStr}: ${dayItem.fee}`);
  }

  const protocolRevenueNum = dailyFeesNum / 6;
  const lpFeesNum = dailyFeesNum - protocolRevenueNum;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyFeesNum, SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(lpFeesNum, SWAP_FEES_TO_LPS);
  dailyRevenue.addUSDValue(protocolRevenueNum, SWAP_FEES_TO_BUYBACK);
  dailyHoldersRevenue.addUSDValue(protocolRevenueNum, TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the source API only returns daily aggregates for closed UTC days
  fetch,
  chains: [CHAIN.TRON],
  start: "2024-01-06",
  methodology: {
    Fees: "A 0.3% fee is charged on each swap.",
    Revenue: "1/6 of swap fees are used to buyback and burn SUN.",
    ProtocolRevenue: "The protocol keeps no revenue for itself.",
    SupplySideRevenue: "5/6 of swap fees are distributed to liquidity providers.",
    HoldersRevenue: "1/6 of swap fees are used to buyback and burn SUN.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "A 0.3% fee charged on each swap on SunSwap V2.",
    },
    Revenue: {
      [SWAP_FEES_TO_BUYBACK]: "1/6 of swap fees used to buyback and burn SUN.",
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: "5/6 of swap fees distributed to liquidity providers.",
    },
    HoldersRevenue: {
      [TOKEN_BUY_BACK]: "1/6 of swap fees used to buyback and burn SUN.",
    },
  },
};

export default adapter;
