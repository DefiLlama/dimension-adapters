import { Dependencies, SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { getMultipleAccounts } from "../../helpers/solana";
import { METRIC } from "../../helpers/metrics";
import axios from "axios";
const eclipseStatsApiEndpoint =
  "https://stats.invariant.app/eclipse/intervals/eclipse-mainnet?interval=daily";

// create pool hardcodes protocol_fee onchain
const PROTOCOL_FEE_RATIO = 0.01;

// https://github.com/invariant-labs/protocol/blob/master/programs/invariant/src/lib.rs
const INVARIANT_PROGRAM = "HyaB3W9q6XdA5xwpU4XnSZV94htfmbmqJXZcEbRaJutt";

// https://github.com/invariant-labs/protocol/blob/master/programs/invariant/src/structs/pool.rs
const POOL_FEE_OFFSET = 154;
const FIXED_POINT_DENOMINATOR = 1e12;

type StatsApiResponse = {
  data: {
    timestamp: number;
    volume24: { value: number; };
    fees24: { value: number; };
  };
};

const SECONDS_PER_DAY = 24 * 60 * 60;
// the interval snapshot stamps the day it covers and used to advance daily,
// so anything older than two days is a stale snapshot rather than a fresh one
const MAX_SNAPSHOT_AGE = 2 * SECONDS_PER_DAY;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readFixedPoint = (data: Buffer, offset: number): number =>
  Number(data.readBigUInt64LE(offset) + (data.readBigUInt64LE(offset + 8) << BigInt(64))) / FIXED_POINT_DENOMINATOR;

const fetchSolana = async (options: FetchOptions) => {
  // stats.invariant.app froze on 2026-03-09 and Invariant disabled its snapshot job, so swaps come from Allium,
  // which decodes every Invariant swap instruction, direct or routed through an aggregator.
  // usd_amount is the lower of the two legs' USD values; trades it cannot price are left out.
  const rows = await queryAllium(`
    SELECT pool, SUM(usd_amount) AS volume_usd
    FROM solana.dex.trades
    WHERE program_id = '${INVARIANT_PROGRAM}'
      AND usd_amount IS NOT NULL
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY pool
  `);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const poolAccounts = await getMultipleAccounts({
    chain: CHAIN.SOLANA,
    accounts: rows.map((row: any) => row.pool),
    dataSlice: { offset: POOL_FEE_OFFSET, length: 32 },
  });

  rows.forEach((row: any, i: number) => {
    const account = poolAccounts[i];
    if (!account || account.owner !== INVARIANT_PROGRAM)
      throw new Error(`invariant: pool account ${row.pool} not found`);
    const data = Buffer.from(account.data[0], "base64");
    const fee = readFixedPoint(data, 0);
    const protocolFee = readFixedPoint(data, 16);

    const volume = Number(row.volume_usd);
    const fees = volume * fee;
    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees * protocolFee, "Swap Fees To Protocol");
    dailySupplySideRevenue.addUSDValue(fees * (1 - protocolFee), "Swap Fees To LPs");
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const fetch = async (
  fullSnapEndpoint: string,
  options: FetchOptions
): Promise<FetchResult> => {
  const fullSnapResponse = await axios.get<any, StatsApiResponse>(
    fullSnapEndpoint
  );

  const dailyVolume = readNumber(fullSnapResponse.data.volume24?.value);
  const dailyFees = readNumber(fullSnapResponse.data.fees24?.value);
  const snapshotTimestamp = readNumber(fullSnapResponse.data.timestamp);
  if (
    dailyVolume === null ||
    dailyFees === null ||
    snapshotTimestamp === null ||
    dailyVolume < 0 ||
    dailyFees < 0
  )
    throw new Error(
      `invariant: unreadable stats snapshot from ${fullSnapEndpoint} (volume24 ${JSON.stringify(fullSnapResponse.data.volume24?.value)}, fees24 ${JSON.stringify(fullSnapResponse.data.fees24?.value)}, timestamp ${JSON.stringify(fullSnapResponse.data.timestamp)})`
    );

  const snapshotAge = options.endTimestamp - snapshotTimestamp / 1000;
  if (snapshotAge > MAX_SNAPSHOT_AGE)
    throw new Error(
      `invariant: ${fullSnapEndpoint} last advanced ${Math.floor(snapshotAge / SECONDS_PER_DAY)} days ago (timestamp ${new Date(snapshotTimestamp).toISOString()}), its 24h figures are not current`
    );

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * (1 - PROTOCOL_FEE_RATIO),
    dailyRevenue: dailyFees * PROTOCOL_FEE_RATIO,
    dailyProtocolRevenue: dailyFees * PROTOCOL_FEE_RATIO,
  };
};

const fetchEclipse = async (options: FetchOptions) => {
  return fetch(eclipseStatsApiEndpoint, options);
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2022-03-22",
    },
    // [CHAIN.ECLIPSE]: {
    //   fetch: fetchEclipse,
    //   runAtCurrTime: true,
    //   start: "2024-12-22",
    //   deadFrom: "2026-03-10", // stats.invariant.app eclipse snapshot stopped advancing on 2026-03-09, and Allium does not index Eclipse
    // },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Swaps on Invariant's Solana pools, direct or routed through aggregators, valued in USD per trade. Eclipse volume came from Invariant's stats API until it stopped updating on 2026-03-09.",
    Fees: "Swap fees paid by traders: each pool's fee tier, read from the pool account on-chain, applied to the pool's swap volume.",
    Revenue: "The protocol fee on each pool, 1% of swap fees, kept by Invariant.",
    ProtocolRevenue: "The protocol fee on each pool, 1% of swap fees, collected for Invariant's fee receiver.",
    SupplySideRevenue: "99% of swap fees, which go to liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at each pool's fee tier.",
    },
    Revenue: {
      "Swap Fees To Protocol": "The 1% protocol fee taken from swap fees.",
    },
    ProtocolRevenue: {
      "Swap Fees To Protocol": "The 1% protocol fee taken from swap fees, collected for Invariant's fee receiver.",
    },
    SupplySideRevenue: {
      "Swap Fees To LPs": "The remaining 99% of swap fees, earned by liquidity providers.",
    },
  },
};

export default adapter;
