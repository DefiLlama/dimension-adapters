import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { postURL } from "../utils/fetchURL";

// Moved from factory/subscan.ts: hydration.api.subscan.io returns 404 (checked 2026-11-08, last stored day 2026-08-26).
// Source: Hydration's own Subsquid explorer indexer, the one app.hydration.net reads (VITE_INDEXER_URL in
// https://github.com/galacticcouncil/hydration-ui/blob/master/apps/main/.env.production), plus the Hydration EVM RPC for receipts.
//
// Fee routing (https://github.com/galacticcouncil/hydration-node/tree/master/runtime/hydradx/src):
// - system.rs: OnChargeTransaction = TransferFees<..., DepositAll<Runtime>, TreasuryAccount, ...>, so the whole fee of a signed
//   extrinsic, tip included, is deposited to the treasury (py/trsry) in whichever asset the payer uses for fees. Nothing is burned.
//   TransactionPayment.TransactionFeePaid { actualFee, tip } reports it in HDX, and actualFee includes the tip.
//   Check: extrinsic 16707991-2 emits actualFee 1,364,240,654,615 (tip 1,010,000,000,000) and a Balances.Deposit of exactly
//   that amount to py/trsry; same pattern in blocks 1,478,117 (2022) and 4,588,346 (2024).
// - evm/evm_fee.rs: DepositEvmFeeToTreasury sends EVM gas (priced in WETH, asset 20) to the same treasury.
// Not counted: gas of substrate-signed EVM.call extrinsics, which has no Ethereum receipt and is only visible as a treasury
// deposit (~2 calls and ~1 HDX per hour on 2026-11-07).
const EXPLORER = "https://explorer.hydradx.cloud/graphql";
const EVM_RPC = "https://rpc.hydradx.cloud";
const HDX_DECIMALS = 12;
const PAGE_SIZE = 1000;
const RECEIPT_BATCH_SIZE = 50;

async function graphql(query: string, variables: Record<string, any>) {
  const res = await postURL(EXPLORER, { query, variables });
  if (res.errors) throw new Error(`hydration explorer: ${JSON.stringify(res.errors).slice(0, 300)}`);
  return res.data;
}

// Ordering blocks by height times out on the explorer's database, ordering by timestamp uses its index. Up to three parachain
// blocks share a timestamp (elastic scaling) and the block table holds duplicate rows, so take the lowest height of the
// earliest timestamp.
async function firstBlockAtOrAfter(timestamp: number): Promise<number> {
  const ts = new Date(timestamp * 1000).toISOString();
  const { blocks } = await graphql(
    `query($ts: DateTime!) { blocks(limit: 10, orderBy: timestamp_ASC, where: {timestamp_gte: $ts}) { height timestamp } }`,
    { ts },
  );
  // also guards against indexer lag: the window is only complete once a block at or after its end is indexed
  if (!blocks.length) throw new Error(`hydration explorer has no block at or after ${ts} yet`);
  return Math.min(...blocks.filter((b: any) => b.timestamp === blocks[0].timestamp).map((b: any) => b.height));
}

// Event ids start with the zero-padded block height, so an id range selects the blocks [fromBlock, toBlock) through the primary
// key. Filtering on the joined block instead returns the duplicated block rows twice.
const blockIdPrefix = (block: number) => String(block).padStart(10, "0");

async function getEventArgs(name: string, fromBlock: number, toBlock: number): Promise<any[]> {
  const args: any[] = [];
  let after = blockIdPrefix(fromBlock);
  const before = blockIdPrefix(toBlock);
  while (true) {
    const { events } = await graphql(
      `query($name: String!, $after: String!, $before: String!) {
        events(limit: ${PAGE_SIZE}, orderBy: id_ASC, where: {name_eq: $name, id_gt: $after, id_lt: $before}) { id args }
      }`,
      { name, after, before },
    );
    events.forEach((e: any) => args.push(e.args));
    if (events.length < PAGE_SIZE) return args;
    after = events[events.length - 1].id;
  }
}

// gas paid by Ethereum transactions, in WETH wei
async function getEvmGasPaid(txHashes: string[]): Promise<bigint> {
  let total = 0n;
  for (let i = 0; i < txHashes.length; i += RECEIPT_BATCH_SIZE) {
    const requests = txHashes.slice(i, i + RECEIPT_BATCH_SIZE)
      .map((hash, id) => ({ jsonrpc: "2.0", id, method: "eth_getTransactionReceipt", params: [hash] }));
    const responses: any[] = await postURL(EVM_RPC, requests);
    if (!Array.isArray(responses) || responses.length !== requests.length) throw new Error(`hydration evm rpc: expected ${requests.length} receipts`);
    for (const { id, result, error } of responses) {
      if (!result) throw new Error(`hydration evm rpc: no receipt for ${requests[id].params[0]} ${JSON.stringify(error ?? {})}`);
      total += BigInt(result.gasUsed) * BigInt(result.effectiveGasPrice);
    }
  }
  return total;
}

const fetch = async (options: FetchOptions) => {
  const fromBlock = await firstBlockAtOrAfter(options.startTimestamp);
  const toBlock = await firstBlockAtOrAfter(options.endTimestamp);

  let feesWithTips = 0n;
  let tips = 0n;
  for (const { actualFee, tip } of await getEventArgs("TransactionPayment.TransactionFeePaid", fromBlock, toBlock)) {
    feesWithTips += BigInt(actualFee);
    tips += BigInt(tip ?? 0);
  }
  const evmTxHashes = (await getEventArgs("Ethereum.Executed", fromBlock, toBlock)).map((e) => e.transactionHash);
  const evmGas = await getEvmGasPaid(evmTxHashes);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const transactionFees = Number(feesWithTips - tips) / 10 ** HDX_DECIMALS;
  const transactionTips = Number(tips) / 10 ** HDX_DECIMALS;
  const evmFees = Number(evmGas) / 1e18;

  dailyFees.addCGToken("hydradx", transactionFees, METRIC.TRANSACTION_GAS_FEES);
  dailyFees.addCGToken("hydradx", transactionTips, METRIC.TRANSACTION_PRIORITY_FEES);
  dailyFees.addCGToken("ethereum", evmFees, "EVM Transaction Gas Fees");
  dailyRevenue.addCGToken("hydradx", transactionFees, "Transaction Gas Fees To Treasury");
  dailyRevenue.addCGToken("hydradx", transactionTips, "Transaction Priority Fees To Treasury");
  dailyRevenue.addCGToken("ethereum", evmFees, "EVM Transaction Gas Fees To Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYDRADX],
  // TransactionPayment.TransactionFeePaid exists from the runtime upgrade on 2022-11-29, mid-day (616 of that day's 674 signed
  // extrinsics carry it), and the explorer has no fee for earlier extrinsics; HDX has no price on coins.llama.fi before 2023-01-27,
  // so the days in between would be stored as $0
  start: "2023-01-27",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction fees and tips paid by users of the Hydration network, for both Substrate extrinsics and EVM transactions. Excludes the EVM gas of Substrate-signed EVM.call extrinsics.",
    Revenue: "All transaction fees and tips paid by users, which the Hydration runtime deposits into its treasury; nothing is burned.",
    ProtocolRevenue: "All transaction fees and tips paid by users, sent to the Hydration treasury account.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Base, weight and length fees of signed Substrate extrinsics, valued in HDX (fees paid in other assets are converted by the runtime).",
      [METRIC.TRANSACTION_PRIORITY_FEES]: "Tips added to signed Substrate extrinsics for priority.",
      "EVM Transaction Gas Fees": "Gas paid by Ethereum transactions on the Hydration EVM, valued in WETH.",
    },
    Revenue: {
      "Transaction Gas Fees To Treasury": "Base, weight and length fees of signed Substrate extrinsics, deposited into the treasury.",
      "Transaction Priority Fees To Treasury": "Tips on signed Substrate extrinsics, deposited into the treasury.",
      "EVM Transaction Gas Fees To Treasury": "Gas paid by Ethereum transactions, deposited into the treasury.",
    },
    ProtocolRevenue: {
      "Transaction Gas Fees To Treasury": "Base, weight and length fees of signed Substrate extrinsics, deposited into the treasury.",
      "Transaction Priority Fees To Treasury": "Tips on signed Substrate extrinsics, deposited into the treasury.",
      "EVM Transaction Gas Fees To Treasury": "Gas paid by Ethereum transactions, deposited into the treasury.",
    },
  },
};

export default adapter;
