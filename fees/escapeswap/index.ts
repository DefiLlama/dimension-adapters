import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64 } from "../../helpers/alliumSolanaEvents";
import { creatorFeesSql, indexedSql, SOURCE_ESCAPESWAP, SOLANA_START } from "../escapehub";

const SWAP_PROGRAM = "EscapeSwCMQocQoabyGaXDyN1BmhCR6orUV7kmxFRmY";

const EVENT_CPI_TAG = "e445a52e51cb9a1d";
// u64: gross_quote @129, protocol_fee @137, creator_fee @145, lp_fee @153
const SWAP_EVENT = "eac10367dc1dbe72";
const SWAP_EVENT_LENGTH = 242;

export async function fetchEscapeSwap(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [row] = await queryAllium(`
    WITH swaps AS (
      SELECT
        COALESCE(SUM(${u64("data_hex", 129)}), 0) AS volume,
        COALESCE(SUM(${u64("data_hex", 137)}), 0) AS protocol,
        COALESCE(SUM(${u64("data_hex", 145)}), 0) AS creator_total,
        COALESCE(SUM(${u64("data_hex", 153)}), 0) AS lp,
        COUNT_IF(LENGTH(data_hex) / 2 <> ${SWAP_EVENT_LENGTH}) AS unknown_layout
      FROM solana.raw.inner_instructions
      WHERE program_id = '${SWAP_PROGRAM}'
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND SUBSTR(data_hex, 17, 16) = '${SWAP_EVENT}'
    ),
    creator AS (${creatorFeesSql(options, SOURCE_ESCAPESWAP)}),
    checks AS (${indexedSql(options)})
    SELECT s.volume, s.protocol, s.creator_total, s.lp, s.unknown_layout, c.cashback, c.creator, c.deposit_unknown_layout, k.indexed
    FROM swaps s, creator c, checks k
  `);
  if (!row) throw new Error("escapeswap: empty Allium response");
  if (!row.indexed) throw new Error(`escapeswap: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(row.unknown_layout) > 0) throw new Error(`escapeswap: ${row.unknown_layout} swap events with unknown layout`);
  if (Number(row.deposit_unknown_layout) > 0) throw new Error(`escapeswap: ${row.deposit_unknown_layout} creator fee events with unknown layout`);
  if (BigInt(row.creator_total) !== BigInt(row.cashback) + BigInt(row.creator))
    throw new Error(`escapeswap: creator fee mismatch ${row.creator_total} vs ${BigInt(row.cashback) + BigInt(row.creator)}`);

  const SOL = ADDRESSES.solana.SOL;
  dailyVolume.add(SOL, row.volume);
  dailyFees.add(SOL, row.protocol, "Swap Fees To Protocol");
  dailyFees.add(SOL, row.creator, "Swap Fees To Creators");
  dailyFees.add(SOL, row.cashback, "Swap Cashback To Traders");
  dailyFees.add(SOL, row.lp, "Swap Fees To LPs");
  dailyRevenue.add(SOL, row.protocol, "Swap Fees To Protocol");
  dailySupplySideRevenue.add(SOL, row.creator, "Swap Fees To Creators");
  dailySupplySideRevenue.add(SOL, row.cashback, "Swap Cashback To Traders");
  dailySupplySideRevenue.add(SOL, row.lp, "Swap Fees To LPs");

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, ...fees } = await fetchEscapeSwap(options);
  return fees;
};

const methodology = {
  Fees: "Swap fees paid by traders on EscapeSwap pools.",
  UserFees: "Swap fees paid by traders on EscapeSwap pools.",
  Revenue: "Protocol share of swap fees.",
  ProtocolRevenue: "Protocol share of swap fees.",
  SupplySideRevenue: "Creator / cashback share and LP share of swap fees.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees To Protocol": "Protocol share of swap fees.",
    "Swap Fees To Creators": "Creator share of swap fees on Sharing tokens.",
    "Swap Cashback To Traders": "Cashback share of swap fees on Cashback tokens.",
    "Swap Fees To LPs": "LP share of swap fees, kept in the pool.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share of swap fees.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Protocol share of swap fees.",
  },
  SupplySideRevenue: {
    "Swap Fees To Creators": "Creator share of swap fees on Sharing tokens.",
    "Swap Cashback To Traders": "Cashback share of swap fees on Cashback tokens.",
    "Swap Fees To LPs": "LP share of swap fees, kept in the pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: SOLANA_START,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
