import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const HIRO_API = "https://api.hiro.so/extended";
// holds the reserves of every Velar AMM pool and prints one event per swap
const CORE = "SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core";
// Hiro cursors are chain positions (block:microblock:tx index[:event index]); this one points at the end of a block
const endOfBlock = (block: number) => `${block}:2147483647:32767`;

const SWAP_FEES_TO_LPS = "Swap Fees To LPs";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";

const uintField = (repr: string, key: string) => Number(repr.match(new RegExp(`\\(${key} u(\\d+)\\)`))![1]);
const principalField = (repr: string, key: string) => repr.match(new RegExp(`\\(${key} '([^)]+)\\)`))![1];

async function getCoreTxs({ startTimestamp, endTimestamp }: FetchOptions) {
  const tip = await fetchURLAutoHandleRateLimit(`${HIRO_API}/v3/blocks?limit=1`);
  if (tip.results[0].time < endTimestamp) throw new Error(`velar: Hiro has no Stacks block after ${endTimestamp} yet`);

  // v3 has no time filter yet. end_time matches the anchoring Bitcoin block, which is never newer than the Stacks block, so no block of the window is above this one
  const lastTx = await fetchURLAutoHandleRateLimit(`${HIRO_API}/v1/tx?end_time=${endTimestamp}&limit=1`);
  const lastBlock: number = lastTx.results[0].block_height;

  const txIds = new Set<string>();
  let firstBlock = lastBlock;
  let cursor = endOfBlock(lastBlock);
  while (cursor) {
    const page = await fetchURLAutoHandleRateLimit(`${HIRO_API}/v3/principals/${CORE}/transactions?limit=50&cursor=${cursor}`);
    for (const { transaction } of page.results) {
      if (transaction.status !== "success" || transaction.block.time < startTimestamp || transaction.block.time >= endTimestamp) continue;
      txIds.add(transaction.tx_id);
      firstBlock = transaction.block.height;
    }
    const oldest = page.results[page.results.length - 1];
    if (!oldest || oldest.transaction.block.time < startTimestamp) break;
    cursor = page.cursor.next;
  }
  return { txIds, firstBlock, lastBlock };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { txIds, firstBlock, lastBlock } = await getCoreTxs(options);
  let cursor = txIds.size ? `${endOfBlock(lastBlock)}:32767` : null;
  while (cursor && Number(cursor.split(":")[0]) >= firstBlock) {
    const page = await fetchURLAutoHandleRateLimit(`${HIRO_API}/v2/smart-contracts/${CORE}/logs?limit=100&cursor=${cursor}`);
    for (const { tx_id, contract_log } of page.results) {
      const repr: string = contract_log.value.repr;
      if (!txIds.has(tx_id) || !repr.includes('(op "swap")')) continue;

      const amountIn = uintField(repr, "amt-in");
      const { token, amount } = addOneToken({
        balances: dailyVolume,
        token0: principalField(repr, "token-in"),
        amount0: amountIn,
        token1: principalField(repr, "token-out"),
        amount1: uintField(repr, "amt-out"),
      });
      // fees are charged in the token sold and valued here in the token the volume is counted in
      const lpFee = (uintField(repr, "amt-fee-lps") * amount) / amountIn;
      const protocolFee = (uintField(repr, "amt-fee-protocol") * amount) / amountIn;
      dailyFees.add(token, lpFee + protocolFee, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token, lpFee, SWAP_FEES_TO_LPS);
      dailyRevenue.add(token, protocolFee, SWAP_FEES_TO_PROTOCOL);
    }
    // this list pages towards older logs through prev_cursor
    cursor = page.prev_cursor;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Value of all token swaps in Velar AMM pools on Stacks.",
  Fees: "Swap fees paid by traders on every swap in Velar AMM pools.",
  UserFees: "Swap fees paid by traders on every swap in Velar AMM pools.",
  Revenue: "The share of each swap fee that Velar AMM pools set aside for the protocol.",
  ProtocolRevenue: "The share of each swap fee that Velar AMM pools set aside for the protocol.",
  SupplySideRevenue: "The share of each swap fee that stays in the pool for its liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders in Velar AMM pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders in Velar AMM pools.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's share of each swap fee.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's share of each swap fee.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS]: "The liquidity providers' share of each swap fee, kept in the pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STACKS],
  start: "2024-03-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
