import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

const ZIGCHAIN_ARCHIVAL_LCD = "https://api.zigchain.com";
const STAKER_CONTRACT = "zig18nnde5tpn76xj3wm53n0tmuf3q06nruj3p6kdemcllzxqwzkpqzqk7ue55";

function encodeQuery(data: Record<string, unknown>): string {
  return encodeURIComponent(Buffer.from(JSON.stringify(data)).toString("base64"));
}

const blockCache: Record<number, number> = {};

async function getBlockTimestamp(height: number): Promise<number> {
  if (blockCache[height]) return blockCache[height];
  const res = await httpGet(`${ZIGCHAIN_ARCHIVAL_LCD}/cosmos/base/tendermint/v1beta1/blocks/${height}`);
  if (!res?.block?.header?.time) throw new Error(`valdora-finance: missing block header for height ${height}`);
  const ts = Math.floor(new Date(res.block.header.time).getTime() / 1000);
  blockCache[height] = ts;
  return ts;
}

async function getLatestHeight(): Promise<number> {
  const res = await httpGet(`${ZIGCHAIN_ARCHIVAL_LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`);
  if (!res?.block?.header?.height) throw new Error("valdora-finance: failed to fetch latest block height");
  return Number(res.block.header.height);
}

async function getHeightAtOrBefore(timestamp: number): Promise<number> {
  const latest = await getLatestHeight();
  const latestTs = await getBlockTimestamp(latest);
  if (timestamp >= latestTs) return latest;

  let low = 1;
  let high = latest;
  let best = latest;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const ts = await getBlockTimestamp(mid);
    if (ts <= timestamp) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

async function queryDailyRewards(height: number) {
  const url = `${ZIGCHAIN_ARCHIVAL_LCD}/cosmwasm/wasm/v1/contract/${STAKER_CONTRACT}/smart/${encodeQuery({ daily_rewards_and_fees: {} })}`;
  const res = await httpGet(url, { headers: { "x-cosmos-block-height": String(height) } });
  if (!res?.data?.rewards_earned_today || !res?.data?.fees_minted_today)
    throw new Error(`valdora-finance: missing daily_rewards_and_fees data at block ${height}`);
  return res.data as { rewards_earned_today: string; fees_minted_today: string };
}

const fetch = async (options: FetchOptions) => {
  const height = await getHeightAtOrBefore(options.toTimestamp);
  const { rewards_earned_today, fees_minted_today } = await queryDailyRewards(height);

  const supplySideAmount = (BigInt(rewards_earned_today) - BigInt(fees_minted_today)).toString();

  const dailyFees = options.createBalances();
  dailyFees.add("uzig", rewards_earned_today, METRIC.STAKING_REWARDS);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.add("uzig", fees_minted_today, METRIC.PROTOCOL_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add("uzig", supplySideAmount, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Gross ZIG staking rewards earned by all ZIG delegated through Valdora, as reported by the protocol's on-chain daily rewards tracker.",
  Revenue: "10% performance fee on staking rewards, directed to the protocol treasury.",
  ProtocolRevenue: "10% performance fee on staking rewards directed to the protocol treasury.",
  SupplySideRevenue: "90% of staking rewards accruing to stZIG holders via redemption-rate appreciation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Gross ZIG staking rewards accumulated today across all validator ledgers delegated through Valdora.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "10% performance fee on staking rewards directed to the Valdora treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "10% performance fee on staking rewards directed to the Valdora treasury.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "90% of staking rewards accrued into stZIG.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true disabled: daily_rewards_and_fees is a cumulative daily snapshot, summing 24 hourly readings inflates the result ~24x
  methodology,
  breakdownMethodology,
  adapter: {
    zigchain: {
      fetch,
      start: "2025-09-30",
    },
  },
};

export default adapter;
