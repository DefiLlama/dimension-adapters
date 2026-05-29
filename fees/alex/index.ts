import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";

const V2_GQL = "https://gql-v2.alexlab.co/v1/graphql";
const AMM_V2_START = 1720224000; // 2024-07-06
const FEE_PRECISION = 1e18;

type FeeStats = { fees: number; supplySide: number };
type PoolVolumeRow = { pool_id: number; volume: string };
type SnapshotFeeRow = {
  burn_block_time: number;
  pool_id: number;
  fee_24h: string;
  fee_rebate_24h: string;
};
type SnapshotRateRow = {
  burn_block_time: number;
  pool_id: number;
  fee_rate_x: string;
  fee_rate_y: string;
  fee_rebate: string;
};

const emptyStats = (): FeeStats => ({ fees: 0, supplySide: 0 });
const gql = async <T>(url: string, query: string): Promise<T> => (await postURL(url, { query })).data;

async function v2Fees(start: number, end: number): Promise<FeeStats> {
  const data = await gql<{ sink_mart_amm_pool_v2_1_volume_by_pool_1d: PoolVolumeRow[] }>(V2_GQL, `{
    sink_mart_amm_pool_v2_1_volume_by_pool_1d(
      where: { date: { _gte: "${new Date(start * 1000).toISOString()}", _lt: "${new Date(end * 1000).toISOString()}" } }
    ) { pool_id volume }
  }`);
  const volumeRows = data.sink_mart_amm_pool_v2_1_volume_by_pool_1d;
  if (!volumeRows.length) return emptyStats();
  const poolIds = [...new Set(volumeRows.map((row) => row.pool_id))];

  const blockData = await gql<{ synced_blocks: Array<{ block_height: number }> }>(V2_GQL, `{
    synced_blocks(
      where: { burn_block_time: { _lte: ${end} } }
      order_by: { burn_block_time: desc }
      limit: 1
    ) { block_height }
  }`);
  const endBlock = blockData.synced_blocks[0]?.block_height;
  if (!endBlock) throw new Error(`ALEX block missing for timestamp ${end}`);

  const snapshotQueries = poolIds.map((poolId) => `
    pool_${poolId}: amm_swap_pool_stats_v2_1(
      where: { pool_id: { _eq: ${poolId} }, block_height: { _lte: ${endBlock} } }
      order_by: { block_height: desc }
      limit: 1
    ) { pool_id burn_block_time fee_rate_x fee_rate_y fee_rebate }
  `).join("\n");
  const snapshotsByPool = await gql<Record<string, SnapshotRateRow[]>>(V2_GQL, `{ ${snapshotQueries} }`);

  const ratesByPool: Record<number, { feeRate: number; lpShare: number }> = {};
  Object.values(snapshotsByPool).forEach((rows) => {
    const row = rows[0];
    if (!row) throw new Error(`ALEX v2 fee snapshot missing for block ${endBlock}`);
    ratesByPool[row.pool_id] = {
      // The daily volume table is not directional, so use the average of token-x and token-y fee rates.
      feeRate: (Number(row.fee_rate_x) + Number(row.fee_rate_y)) / 2 / FEE_PRECISION,
      lpShare: Number(row.fee_rebate) / FEE_PRECISION,
    };
  });

  const stats = volumeRows.reduce<FeeStats>((acc, row) => {
    const rate = ratesByPool[row.pool_id];
    if (!rate) throw new Error(`ALEX v2 fee rate missing for pool ${row.pool_id}`);
    const fees = Number(row.volume) / FEE_PRECISION * rate.feeRate;
    acc.fees += fees;
    acc.supplySide += fees * rate.lpShare;
    return acc;
  }, emptyStats());

  return stats;
}

async function v1_1Fees(start: number, end: number): Promise<FeeStats> {
  const data = await gql<{ amm_swap_pool_stats_v1_1: SnapshotFeeRow[] }>(V2_GQL, `{
    amm_swap_pool_stats_v1_1(
      where: { burn_block_time: { _gte: ${start}, _lt: ${end} } }
    ) { burn_block_time pool_id fee_24h fee_rebate_24h }
  }`);
  const latestByPool: Record<number, SnapshotFeeRow> = {};
  data.amm_swap_pool_stats_v1_1.forEach((row) => {
    const current = latestByPool[row.pool_id];
    if (!current || row.burn_block_time > current.burn_block_time) latestByPool[row.pool_id] = row;
  });

  const stats = Object.values(latestByPool).reduce<FeeStats>((acc, row) => {
    acc.fees += Number(row.fee_24h) / FEE_PRECISION;
    acc.supplySide += Number(row.fee_rebate_24h) / FEE_PRECISION;
    return acc;
  }, emptyStats());

  return stats;
}

const fetch = async (_timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const stats = options.startOfDay >= AMM_V2_START
    ? await v2Fees(options.startOfDay, options.endTimestamp)
    : await v1_1Fees(options.startOfDay, options.endTimestamp);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(stats.fees, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(stats.supplySide, "Swap Fees To LPs");
  dailyRevenue.addUSDValue(stats.fees - stats.supplySide, "Swap Fees To Protocol");

  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Total swap fees paid by ALEX AMM traders.",
  SupplySideRevenue: "The LP rebate portion of ALEX AMM swap fees.",
  Revenue: "ALEX AMM swap fees retained by ALEX Lab Foundation after LP rebates.",
  ProtocolRevenue: "ALEX AMM swap fees retained by ALEX Lab Foundation after LP rebates.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Total swap fees paid by ALEX AMM traders." },
  SupplySideRevenue: { "Swap Fees To LPs": "Swap fee rebates paid to liquidity providers." },
  Revenue: { "Swap Fees To Protocol": "Swap fees retained by ALEX Lab Foundation after LP rebates." },
  ProtocolRevenue: { "Swap Fees To Protocol": "Swap fees retained by ALEX Lab Foundation after LP rebates." },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STACKS],
  start: "2023-05-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
