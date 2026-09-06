import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// Jetbit is a perpetual-futures exchange where every position fills against a
// single on-chain USDT pool on BNB Chain (custody/settlement is on-chain; the
// matching engine is off-chain). Per-trade volume therefore cannot be read from
// chain, so it is served from Jetbit's PUBLIC, aggregate-only feed:
//
//   GET https://jetbit.com/_exchange/api/v1/public/defillama/overview
//   -> {
//        dailyVolume: [{ date: "YYYY-MM-DD" (UTC), volume: number }],
//        dailyFees:   [{ date: "YYYY-MM-DD" (UTC), fees:   number }],
//        ...
//      }
//
// Volume = real perpetual notional (filled_quantity x filled_price). Copy-trade
// mirror volume and any display padding are excluded server-side, so the numbers
// reconcile to Jetbit's own books. Fees = trading commission (funding excluded).
const OVERVIEW = "https://jetbit.com/_exchange/api/v1/public/defillama/overview";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(OVERVIEW);
  const day = options.startOfDay; // UTC start-of-day, unix seconds
  const dayStr = new Date(day * 1000).toISOString().slice(0, 10);

  const volRows: any[] = Array.isArray(data.dailyVolume) ? data.dailyVolume : [];
  const feeRows: any[] = Array.isArray(data.dailyFees) ? data.dailyFees : [];

  const volRow = volRows.find((r) => r.date === dayStr);
  const feeRow = feeRows.find((r) => r.date === dayStr);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  dailyVolume.addUSDValue(Number(volRow?.volume) || 0);
  dailyFees.addUSDValue(Number(feeRow?.fees) || 0, METRIC.TRADING_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Real perpetual-futures notional (filled_quantity x filled_price) from Jetbit's " +
    "public aggregate feed; copy-trade mirror volume and display padding are excluded.",
  Fees: "Trading commission collected on perp trades (funding payments excluded).",
  Revenue: "All trading fees are protocol revenue.",
  ProtocolRevenue: "All trading fees go to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Trading commission charged on perp trades.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.BSC],
  fetch,
  start: "2026-07-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
