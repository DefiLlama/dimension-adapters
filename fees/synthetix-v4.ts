import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { postURL } from "../utils/fetchURL";

// backend used by https://stats.synthetix.io (no auth required)
const QUERY_URL = "https://bmzv4vwivoeg3bqpqzxo3qf3ae0qktxn.lambda-url.ap-northeast-1.on.aws/overview-daily-stats?format=JSONEachRow";
const DAY = 24 * 60 * 60;

async function getRows(days: number) {
  const response = await postURL(QUERY_URL, { queryVariables: { days } }, 3, {
    headers: {
      "content-type": "application/json",
    },
  });

  if (typeof response !== "string") throw new Error("Invalid Synthetix v4 ClickHouse response");
  return response.trim().split("\n").filter(Boolean).map((row) => JSON.parse(row));
}

const fetch = async (options: FetchOptions) => {
  const days = Math.ceil((Date.now() / 1000 - options.startOfDay) / DAY) + 1;
  const rows = await getRows(days);
  const row = rows.find((item) => Date.parse(`${item.traded_at_day} UTC`) / 1000 === options.startOfDay);
  if (!row) throw new Error(`No Synthetix v4 fee data found for ${options.startOfDay}`);

  const fees = Number(row.daily_fees);
  if (!Number.isFinite(fees)) throw new Error(`Missing Synthetix v4 fees for ${options.startOfDay}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(fees, "Trading Fees To Protocol");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "Trading fees paid by users on Synthetix v4 perpetual futures trades.",
  UserFees: "Trading fees deducted from users' collateral balances.",
  Revenue: "Trading fees retained by the protocol.",
  ProtocolRevenue: "Trading fees retained by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by Synthetix v4 perpetual futures traders.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees deducted from trader collateral balances.",
  },
  Revenue: {
    "Trading Fees To Protocol": "Trading fees retained by the protocol.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "Trading fees retained by the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ETHEREUM],
  fetch,
  start: "2025-12-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
