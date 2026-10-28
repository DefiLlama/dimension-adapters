import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Daily swap fees from the SUN.io API (daily aggregates in USD, UTC 00:00 millisecond timestamps).
// On-chain source, in case the API has to be replaced: SunSwap V4 PoolManager (singleton, emits Swap events with the fee)
// https://tronscan.org/#/contract/TVjuTE3V5bMVdpfNhid8kD2v35T2k1u1Br
const FEE_API = "https://openapi.sun.io/open/api/feeData";

const SWAP_FEES = 'Swap Fees';
const SWAP_FEES_TO_LPS = 'Swap Fees To LPs';

interface IResponse {
  date: number;
  fee: number;
}

const fetch = async (options: FetchOptions) => {
  const start = options.startOfDay * 1000;
  const url = `${FEE_API}?fromDate=${options.dateString}&toDate=${options.dateString}&version=v4`;
  const res: IResponse[] = (await httpGet(url)).data;
  if (!Array.isArray(res) || !res.length)
    throw new Error(`sunswap-v4: no fee data returned for ${options.dateString}`);
  const dayItem = res.find((item) => item.date === start);
  if (!dayItem)
    throw new Error(`sunswap-v4: no fee data for ${options.dateString}`);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(dayItem.fee, SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(dayItem.fee, SWAP_FEES_TO_LPS);

  // SunSwap V4 has no protocol fee: 100% of swap fees go to liquidity providers.
  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the source API only returns daily aggregates
  fetch,
  chains: [CHAIN.TRON],
  // SunSwap V4 launched on 2026-03-02 00:00 UTC+8 (2026-03-01 16:00 UTC), so 2026-03-01 is the first UTC day with real activity.
  // Earlier rows from the API are pre-launch testing (0 or < $1 per day) and are excluded.
  // Launch announcement: https://sunio.zendesk.com/hc/en-us/articles/55621682087449-Announcement-on-the-Launch-of-SunSwap-V4-on-SUN-io
  start: '2026-03-01',
  methodology: {
    Fees: 'Swap fees paid by users.',
    Revenue: 'SunSwap V4 charges no protocol fee, so the protocol keeps no revenue.',
    SupplySideRevenue: 'All swap fees are distributed to liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'Swap fees paid by users on SunSwap V4 pools.',
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: 'All swap fees are distributed to liquidity providers.',
    },
  },
};

export default adapter;
