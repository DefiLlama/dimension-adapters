import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Daily swap fees from the SUN.io open API (UTC 00:00 millisecond timestamps).
// SunSwap V2 is a Uniswap V2 fork on Tron.
// Factory: TKWJdrQkqHisa1X8HUdHEfREvTzw4pMAaY (0x689abaeeed3f0bb3585773192e23224cac25dd41)
// feeTo: TPdthWzUHfepu2TEBimTFi1sBWtGYi3Ksa (SunMaker)
// The protocol fee (1/6 of the 0.3% swap fee) was activated on 2026-05-01 UTC:
// https://openapi.sun.io/open/api/revenueData?fromDate=2026-04-30&toDate=2026-05-01&version=v2
// 100% of the protocol fee goes to SunMaker to buyback and burn SUN tokens.
// Revenue is 0 before that day (100% of fees went to liquidity providers).
const FEE_API = "https://openapi.sun.io/open/api/feeData";
const PROTOCOL_FEE_START = Date.parse("2026-05-01T00:00:00Z");

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

  // 1/6 of swap fees accrued to SunMaker for SUN buybacks since 2026-05-01.
  const protocolRevenueNum = start >= PROTOCOL_FEE_START ? dailyFeesNum / 6 : 0;
  const lpFeesNum = dailyFeesNum - protocolRevenueNum;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyFeesNum, SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(lpFeesNum, SWAP_FEES_TO_LPS);

  if (protocolRevenueNum > 0) {
    dailyRevenue.addUSDValue(protocolRevenueNum, SWAP_FEES_TO_BUYBACK);
    dailyHoldersRevenue.addUSDValue(protocolRevenueNum, TOKEN_BUY_BACK);
  }

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
    Revenue: "1/6 of swap fees used to buyback and burn SUN since 2026-05-01.",
    ProtocolRevenue: "The protocol keeps no revenue for itself.",
    SupplySideRevenue: "Swap fees distributed to liquidity providers: 100% before 2026-05-01, and 5/6 after protocol fee activation.",
    HoldersRevenue: "1/6 of swap fees used to buyback and burn SUN since 2026-05-01.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "A 0.3% fee charged on each swap on SunSwap V2.",
    },
    Revenue: {
      [SWAP_FEES_TO_BUYBACK]: "1/6 of swap fees used to buyback and burn SUN since 2026-05-01.",
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: "Swap fees distributed to liquidity providers (100% before 2026-05-01, 5/6 thereafter).",
    },
    HoldersRevenue: {
      [TOKEN_BUY_BACK]: "1/6 of swap fees used to buyback and burn SUN since 2026-05-01.",
    },
  },
};

export default adapter;
