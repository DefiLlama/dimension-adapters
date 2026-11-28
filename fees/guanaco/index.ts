import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { postURL } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const CHAINGRAPH_URL = "https://gql.chaingraph.pat.mn/v1/graphql";
const MAX_INDEXER_LAG = 60 * 60;
const DUST_TOP_UPS = "Treasury Dust Top-Ups";

// Guanaco v1 pool covenant spent through its swap branch, treasury 76a914748e3d…: https://github.com/DefiLlama/DefiLlama-Adapters/tree/main/projects/guanaco
const POOL_REDEEM_PATTERN_SUFFIX = "765a96c48cc09476cc5279a269cd198894c0c6c0d095c0cc527994c0d395a17768";
const SWAP_UNLOCKING_BYTECODE = /^4c[0-9a-f]{2}746376a914[0-9a-f]{40}88ac67c0d1c0ce88c25288c0cdc0c788c0c6c0cc9490([0-9a-f]+)765a96c48cc09476cc5279a269cd1976a914748e3dffdc1ab726e8d7d8d381e56034871fe62388ac8894c0c6c0d095c0cc527994c0d395a17768$/;
const SCRIPT_NUMBER = "(5[1-9a-f]|60|01[0-7][0-9a-f]|02[0-9a-f]{2}[0-7][0-9a-f])";
const FEE_PROGRAM = new RegExp(`^(?:${SCRIPT_NUMBER}95)?${SCRIPT_NUMBER}96$`);

const swapsQuery = `query ($from: bigint!, $to: bigint!, $pattern: String!) {
  tip: block(limit: 1, order_by: { height: desc }) { timestamp }
  input(where: { redeem_bytecode_pattern: { _like: $pattern }, transaction: { block_inclusions: { block: { timestamp: { _gte: $from, _lt: $to } } } } }) {
    input_index
    unlocking_bytecode
    outpoint { value_satoshis }
    transaction {
      outputs(order_by: { output_index: asc }) { value_satoshis }
      block_inclusions { block { timestamp accepted_by { node_internal_id } } }
    }
  }
}`;

async function querySwaps(from: number, to: number) {
  const variables = { from, to, pattern: "%" + POOL_REDEEM_PATTERN_SUFFIX };
  let lastError: any;
  // the public instance occasionally answers with a "database query error" (statement timeout) that succeeds on retry
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(10_000 * i);
    const res = await postURL(CHAINGRAPH_URL, { query: swapsQuery, variables });
    if (res.data) return res.data;
    lastError = res.errors;
  }
  throw new Error(`Chaingraph query failed: ${JSON.stringify(lastError)}`);
}

const scriptNumber = (push: string) => {
  const bytes = Buffer.from(push, "hex");
  return BigInt(bytes.length === 1 ? bytes[0] - 0x50 : bytes.readUIntLE(1, bytes.length - 1));
};

function feeRatio(program: string) {
  const match = FEE_PROGRAM.exec(program);
  if (!match) throw new Error(`Unknown Guanaco fee program ${program}`);
  return { multiplier: match[1] ? scriptNumber(match[1]) : 1n, divisor: scriptNumber(match[2]) };
}

async function fetch({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const { tip, input } = await querySwaps(startTimestamp, endTimestamp);
  if (!tip.length || Number(tip[0].timestamp) < endTimestamp - MAX_INDEXER_LAG)
    throw new Error(`Chaingraph tip is more than an hour behind ${new Date(endTimestamp * 1000).toISOString()}`);

  let swapFees = 0n;
  let treasuryShare = 0n;
  let dustTopUps = 0n;
  for (const { input_index, unlocking_bytecode, outpoint, transaction } of input) {
    const swap = SWAP_UNLOCKING_BYTECODE.exec(unlocking_bytecode.slice(2));
    const confirmedInWindow = transaction.block_inclusions.some(({ block }: any) =>
      block.accepted_by.length && Number(block.timestamp) >= startTimestamp && Number(block.timestamp) < endTimestamp);
    if (!swap || !confirmedInWindow) continue;

    const { multiplier, divisor } = feeRatio(swap[1]);
    const outputs = transaction.outputs;
    const index = Number(input_index);
    const reserveChange = BigInt(outputs[index].value_satoshis) - BigInt(outpoint.value_satoshis);
    const fee = (reserveChange < 0n ? -reserveChange : reserveChange) * multiplier / divisor;
    const treasuryPayment = BigInt(outputs[outputs.length - 1 - index].value_satoshis);
    swapFees += fee;
    treasuryShare += fee / 10n;
    dustTopUps += treasuryPayment - fee / 10n;
  }

  const toBch = (sats: bigint) => Number(sats) / 1e8;
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  dailyFees.addCGToken("bitcoin-cash", toBch(swapFees), METRIC.SWAP_FEES);
  dailyFees.addCGToken("bitcoin-cash", toBch(dustTopUps), DUST_TOP_UPS);
  dailySupplySideRevenue.addCGToken("bitcoin-cash", toBch(swapFees - treasuryShare), METRIC.LP_FEES);
  dailyRevenue.addCGToken("bitcoin-cash", toBch(treasuryShare + dustTopUps), METRIC.TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "Swap fees paid by traders on Guanaco pools (0.01% to 1% depending on the pool's fee tier), plus the extra BCH traders add so the treasury payment reaches Bitcoin Cash's 546-satoshi minimum output.",
  UserFees: "Swap fees paid by traders on Guanaco pools (0.01% to 1% depending on the pool's fee tier), plus the extra BCH traders add so the treasury payment reaches Bitcoin Cash's 546-satoshi minimum output.",
  SupplySideRevenue: "90% of swap fees, kept in the pool reserves for liquidity providers.",
  Revenue: "10% of swap fees plus the dust top-ups, paid to the Guanaco treasury to buy back and burn GUA.",
  ProtocolRevenue: "Guanaco keeps no swap fees; the treasury's share is used to buy back and burn GUA.",
  HoldersRevenue: "10% of swap fees plus the dust top-ups, paid to the Guanaco treasury to buy back and burn GUA.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders, 0.01% to 1% of the BCH side of each swap depending on the pool's fee tier.",
    [DUST_TOP_UPS]: "Extra BCH traders add when the treasury's 10% share is below Bitcoin Cash's 546-satoshi minimum output.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders, 0.01% to 1% of the BCH side of each swap depending on the pool's fee tier.",
    [DUST_TOP_UPS]: "Extra BCH traders add when the treasury's 10% share is below Bitcoin Cash's 546-satoshi minimum output.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "90% of swap fees, kept in the pool reserves for liquidity providers.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "10% of swap fees plus the dust top-ups, paid to the Guanaco treasury to buy back and burn GUA.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "10% of swap fees plus the dust top-ups, paid to the Guanaco treasury to buy back and burn GUA.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BITCOIN_CASH],
  start: "2026-09-06",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
