// Memetics Finance (https://memetics.finance): a constant-product AMM on Solana, a fork of Raydium cp-swap
// under its own program id. Source: https://github.com/fomotsar-commits/tegridy-farms/tree/mvp-launch/solana/tegridy-amm
// Swaps are read from the SwapEvent the program logs (states/events.rs), which carries the trade fee it
// charged; the fee to open a pool from the transfer the program makes then (instructions/initialize.rs).
// Read through RPC signatures of the program rather than Allium or Dune: about 200 transactions a day
// and under 6,000 since launch, so the whole history is six pages.
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";
import { base58Encode, getProgramAccounts, solanaRpc } from "../helpers/solana";

// https://solscan.io/account/EKS4C6xvV9A5DMWaWtVnFvi7ru78EhqRAoddEMpQ2BtT
const PROGRAM = "EKS4C6xvV9A5DMWaWtVnFvi7ru78EhqRAoddEMpQ2BtT";
// The wrapped SOL account the program pays the pool creation fee into (lib.rs create_pool_fee_reveiver),
// owned by the protocol's multisig treasury. https://solscan.io/account/2sa31zceMSTAAbSu5wfSnNA6sBYzS7r97nvZYaQouEXa
const POOL_CREATION_FEE_ACCOUNT = "2sa31zceMSTAAbSu5wfSnNA6sBYzS7r97nvZYaQouEXa";

// Anchor's event tag: sha256("event:SwapEvent")[0..8]
const SWAP_EVENT = "40c6cde8260871e2";
const SWAP_EVENT_SIZE = 170;
// Account sizes, discriminator included (states/pool.rs, states/config.rs)
const POOL_STATE_SIZE = 637;
const AMM_CONFIG_SIZE = 236;
const RATE_DENOMINATOR = 1_000_000n; // curve/fees.rs FEE_RATE_DENOMINATOR_VALUE
// The tokens with a market price of their own; most others here trade in few places but these pools.
const MAJOR_ASSETS = new Set([ADDRESSES.solana.SOL, ADDRESSES.solana.USDC, ADDRESSES.solana.USDT]);

// Until this second every fee tier paid its whole non-LP share of the trade fee to the treasury (fund
// rate 0). A multisig proposal then re-set the tiers to today's protocol and fund rates, the same share
// in total: 2026-10-19 07:58:54 UTC, transaction
// 3v8upWGzBvmfsC9nnGpV8CLFhzCnbaDoMsQM3hzupT68k4aqqhnrCQgo5V1bu5bhDdTSADPLA2NKdtm9RJf78yje.
// Rates are read from the tier accounts, which Solana serves at their current state only, so a later
// change needs a dated entry here.
const FUND_SHARE_START = 1792396734;

const LABEL = {
  SwapFees: METRIC.SWAP_FEES,
  CreatorFees: METRIC.CREATOR_FEES,
  PoolCreationFees: "Pool Creation Fees",
  SwapFeesToLps: "Swap Fees To LPs",
  SwapFeesToFundOwner: "Swap Fees To Fund Owner",
  SwapFeesToTreasury: "Swap Fees To Treasury",
  CreatorFeesToCreators: "Creator Fees To Pool Creators",
  PoolCreationFeesToTreasury: "Pool Creation Fees To Treasury",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The public endpoint allows 40 calls of one method per ten seconds from one address (Solana's docs,
// "Clusters and Public RPC Endpoints"), and now and then fails to reach its archive. Both are waited out, so
// a refusal is never read as an empty hour: five waits of 4, 8, 12, 16 and 20 seconds, the first as long as
// a new ten-second window needs to open, and after the fifth the error is thrown.
async function rpc(method: string, params: any[]): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await solanaRpc(method, params);
    } catch (e: any) {
      if (attempt >= 5 || !/429|too many requests|long-term storage/i.test(String(e?.message ?? e))) throw e;
      await sleep(4000 * (attempt + 1));
    }
  }
}

// Finalized only: a finalized signature carries its blockTime and is never dropped. A slot is finalized
// about 13 seconds after it is produced (32 slots of about 0.4 seconds each); 30 leaves a margin.
const FINALITY_SECONDS = 30;
// The most signatures getSignaturesForAddress returns in one call.
const SIGNATURES_PER_PAGE = 1000;
async function readSignatures(before?: string): Promise<any[]> {
  const page = await rpc("getSignaturesForAddress", [PROGRAM, { before, limit: SIGNATURES_PER_PAGE, commitment: "finalized" }]);
  // A malformed answer throws instead of reading as the end of history.
  if (!Array.isArray(page)) throw new Error("memetics-finance: getSignaturesForAddress returned no list");
  return page;
}

// Requests are kept few. The newest page is shared by every window that closed before it was read
// (a run tests 24 hourly windows), and a page older than a given signature never changes.
let newest: { readAt: number; page: Promise<any[]> } | undefined;
const olderPages = new Map<string, Promise<any[]>>();
function signaturesPage(before: string | undefined, windowEnd: number): Promise<any[]> {
  if (before) {
    if (!olderPages.has(before)) olderPages.set(before, readSignatures(before).catch((e) => { olderPages.delete(before); throw e; }));
    return olderPages.get(before)!;
  }
  if (!newest || newest.readAt < windowEnd + FINALITY_SECONDS) {
    const read = { readAt: Math.floor(Date.now() / 1000), page: readSignatures() };
    read.page.catch(() => { if (newest === read) newest = undefined; });
    newest = read;
  }
  return newest.page;
}

// Signatures of the program's successful transactions with blockTime in [from, to), walking back from the tip.
async function signaturesInWindow(from: number, to: number): Promise<string[]> {
  if (Date.now() / 1000 < to + FINALITY_SECONDS)
    throw new Error("memetics-finance: the end of the window is not finalized on Solana yet");
  const out: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await signaturesPage(before, to);
    for (const s of page) {
      if (s.err) continue;
      if (typeof s.blockTime !== "number") throw new Error(`memetics-finance: signature ${s.signature} has no blockTime`);
      if (s.blockTime >= from && s.blockTime < to) out.push(s.signature);
    }
    const oldest = page[page.length - 1];
    if (page.length < SIGNATURES_PER_PAGE || (typeof oldest.blockTime === "number" && oldest.blockTime < from)) return out;
    before = oldest.signature;
  }
}

// No transaction, or one without its logs, means the node could not serve it, not that nothing was
// traded. The public endpoint's nodes do not all hold the same history, so it is asked again first.
// Four tries, 2, 4 and 6 seconds apart: long enough for the endpoint to hand the call to another node.
async function readTransaction(signature: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    // Version 1 transactions exist on Solana; a node asked for version 0 at most refuses them.
    const tx = await rpc("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "finalized" }]);
    if (tx?.meta?.logMessages) return tx;
  }
  throw new Error(`memetics-finance: Solana transaction ${signature} not available`);
}

// The runtime's own lines name a program by its address; a program's "Program log:" lines never match.
const PUBKEY = "[1-9A-HJ-NP-Za-km-z]{32,44}";
const INVOKE = new RegExp(`^Program (${PUBKEY}) invoke \\[\\d+\\]$`);
const EXIT = new RegExp(`^Program ${PUBKEY} (success|failed)`);

// Only the lines the program logged itself: the invoke stack is tracked, so data another program logs in
// the same transaction, even data shaped like a SwapEvent, never counts.
function ownEvents(logs: string[], signature: string): Buffer[] {
  // The network keeps about 10 kB of a transaction's logs: past that, events are lost, not absent.
  if (logs.includes("Log truncated")) throw new Error(`memetics-finance: the logs of ${signature} were cut, its events cannot be read`);
  const stack: string[] = [];
  const out: Buffer[] = [];
  for (const line of logs) {
    const invoke = line.match(INVOKE);
    if (invoke) stack.push(invoke[1]);
    else if (EXIT.test(line)) stack.pop();
    else if (line.startsWith("Program data: ") && stack[stack.length - 1] === PROGRAM)
      out.push(Buffer.from(line.slice("Program data: ".length), "base64"));
  }
  return out;
}

// Lamports the program moved into the pool creation fee account, attributed at the instruction level:
// a transfer counts only while a call of the program is running, whether the transaction called it
// directly or another program did.
function poolCreationFees(tx: any): bigint {
  let total = 0n;
  const innerByIndex = new Map<number, any[]>((tx.meta.innerInstructions ?? []).map((i: any) => [i.index, i.instructions]));
  tx.transaction.message.instructions.forEach((instruction: any, index: number) => {
    // the depth the program's call runs at: 1 for an instruction of the transaction itself, 0 while it is not running
    let running = instruction.programId === PROGRAM ? 1 : 0;
    for (const call of innerByIndex.get(index) ?? []) {
      if (running !== 1 && typeof call.stackHeight !== "number")
        throw new Error("memetics-finance: the RPC returned an inner instruction without its stack height");
      if (running > 1 && call.stackHeight <= running) running = 0;
      if (!running) {
        if (call.programId === PROGRAM) running = call.stackHeight;
        continue;
      }
      if (call.program === "system" && call.parsed?.type === "transfer" && call.parsed.info.destination === POOL_CREATION_FEE_ACCOUNT)
        total += BigInt(call.parsed.info.lamports);
    }
  });
  return total;
}

// Each pool's shares of the trade fee, per million: those of its fee tier (AmmConfig protocol_fee_rate, fund_fee_rate).
type FeeShares = { protocol: bigint; fund: bigint };
async function readFeeShares(): Promise<Map<string, FeeShares>> {
  const pools = await getProgramAccounts({ programId: PROGRAM, filters: [{ dataSize: POOL_STATE_SIZE }], dataSlice: { offset: 8, length: 32 } });
  const tiers = await getProgramAccounts({ programId: PROGRAM, filters: [{ dataSize: AMM_CONFIG_SIZE }], dataSlice: { offset: 20, length: 16 } });
  const data = (account: any): Buffer => Buffer.isBuffer(account.data) ? account.data : Buffer.from(account.data[0], "base64");
  const sharesOfTier = new Map<string, FeeShares>(tiers.map((t: any) =>
    [t.pubkey, { protocol: data(t.account).readBigUInt64LE(0), fund: data(t.account).readBigUInt64LE(8) }]));
  const sharesOfPool = new Map<string, FeeShares>();
  for (const p of pools) {
    const shares = sharesOfTier.get(base58Encode(data(p.account).subarray(0, 32)));
    if (shares) sharesOfPool.set(p.pubkey, shares);
  }
  return sharesOfPool;
}

// Read once for the windows of one run, and again when a swap names a pool opened since.
let feeShares: Promise<Map<string, FeeShares>> | undefined;
async function feeSharesOf(pool: string): Promise<FeeShares> {
  for (const reread of [false, true]) {
    if (reread || !feeShares) {
      const read = readFeeShares();
      read.catch(() => { if (feeShares === read) feeShares = undefined; });
      feeShares = read;
    }
    const shares = (await feeShares).get(pool);
    if (shares) return shares;
  }
  throw new Error(`memetics-finance: no fee tier found for pool ${pool}`);
}

// Transactions read at a time. A window holds a few of them (about 200 a day), and two at a time stays
// inside the public endpoint's 40 calls per ten seconds in normal running; rpc() waits out a refusal.
const TRANSACTIONS_AT_A_TIME = 2;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const signatures = await signaturesInWindow(options.startTimestamp, options.endTimestamp);
  const { errors } = await PromisePool.withConcurrency(TRANSACTIONS_AT_A_TIME).for(signatures).process(async (signature) => {
    const tx = await readTransaction(signature);

    for (const event of ownEvents(tx.meta.logMessages, signature)) {
      if (event.subarray(0, 8).toString("hex") !== SWAP_EVENT) continue;
      if (event.length !== SWAP_EVENT_SIZE) throw new Error(`memetics-finance: a SwapEvent of ${event.length} bytes, not ${SWAP_EVENT_SIZE}`);
      // pool_id @8 | input_vault_before u64 @40 | output_vault_before u64 @48 | input_amount u64 @56 | output_amount u64 @64
      // | input_transfer_fee u64 @72 | output_transfer_fee u64 @80 | base_input u8 @88 | input_mint @89 | output_mint @121
      // | trade_fee u64 @153 | creator_fee u64 @161 | creator_fee_on_input u8 @169
      const pool = base58Encode(event.subarray(8, 40));
      const inputAmount = event.readBigUInt64LE(56);
      const outputAmount = event.readBigUInt64LE(64);
      const inputTransferFee = event.readBigUInt64LE(72);
      const inputMint = base58Encode(event.subarray(89, 121));
      const outputMint = base58Encode(event.subarray(121, 153));
      const tradeFee = event.readBigUInt64LE(153);
      const creatorFee = event.readBigUInt64LE(161);
      const creatorFeeOnInput = event[169] !== 0;

      // A fee tier's keeper is the protocol's own price-keeping bot. The program charges it no trade fee
      // (states/config.rs swap_fee_rates) and every other swap at least one unit (the fee is rounded up),
      // so a swap that paid none is the keeper's: the protocol's own action, not user volume.
      if (tradeFee === 0n) continue;

      // input_amount is what reached the pool, before its fees; the trade fee is charged in that token. When
      // only the token received is a major asset, amounts of the token sent are counted in the major one
      // at the price this swap traded at: what the curve paid out for what it took in, both before the
      // creator fee (curve/calculator.rs).
      let token = inputMint;
      let valued = (amount: bigint) => amount;
      if (!MAJOR_ASSETS.has(inputMint) && MAJOR_ASSETS.has(outputMint)) {
        const curveIn = inputAmount - tradeFee - (creatorFeeOnInput ? creatorFee : 0n);
        const curveOut = outputAmount + (creatorFeeOnInput ? 0n : creatorFee);
        if (curveIn <= 0n) throw new Error(`memetics-finance: a swap in ${signature} left nothing to trade after its fees`);
        token = outputMint;
        valued = (amount: bigint) => (amount * curveOut) / curveIn;
      }

      // Volume is what the trader sent. For a token with a transfer fee (Token-2022) the program takes
      // that fee off before the swap (instructions/swap_base_input.rs, swap_base_output.rs), so it is added
      // back; it is 0 for every other token.
      dailyVolume.add(token, valued(inputAmount + inputTransferFee));

      // The program books the protocol and fund shares of the trade fee rounded down (curve/fees.rs)
      // and leaves the rest in the pool for its liquidity providers. Both shares are revenue; only the
      // protocol owner's, which the multisig treasury collects, is protocol revenue.
      const shares = await feeSharesOf(pool);
      const fee = valued(tradeFee);
      // Before FUND_SHARE_START a tier had one rate, today's two added together, and no fund share. The
      // program rounds each share it books down once (curve/fees.rs), so that one share is rounded once.
      const fundOwnerPaid = tx.blockTime >= FUND_SHARE_START;
      const protocolRate = fundOwnerPaid ? shares.protocol : shares.protocol + shares.fund;
      const protocolFee = valued((tradeFee * protocolRate) / RATE_DENOMINATOR);
      const fundFee = fundOwnerPaid ? valued((tradeFee * shares.fund) / RATE_DENOMINATOR) : 0n;
      dailyFees.add(token, fee, LABEL.SwapFees);
      dailySupplySideRevenue.add(token, fee - protocolFee - fundFee, LABEL.SwapFeesToLps);
      dailyRevenue.add(token, protocolFee, LABEL.SwapFeesToTreasury);
      dailyProtocolRevenue.add(token, protocolFee, LABEL.SwapFeesToTreasury);
      if (fundOwnerPaid) dailyRevenue.add(token, fundFee, LABEL.SwapFeesToFundOwner);

      // No pool charges a creator fee today; one that does is counted in the token it is charged in.
      if (creatorFee > 0n) {
        const creatorFeeMint = creatorFeeOnInput ? inputMint : outputMint;
        dailyFees.add(creatorFeeMint, creatorFee, LABEL.CreatorFees);
        dailySupplySideRevenue.add(creatorFeeMint, creatorFee, LABEL.CreatorFeesToCreators);
      }
    }

    const creationFees = poolCreationFees(tx);
    if (creationFees > 0n) {
      dailyFees.add(ADDRESSES.solana.SOL, creationFees, LABEL.PoolCreationFees);
      dailyRevenue.add(ADDRESSES.solana.SOL, creationFees, LABEL.PoolCreationFeesToTreasury);
      dailyProtocolRevenue.add(ADDRESSES.solana.SOL, creationFees, LABEL.PoolCreationFeesToTreasury);
    }
  });
  // A transaction that could not be read fails the window: a swap that was not read is never counted as none.
  if (errors.length) throw errors[0];

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "What traders sent into every swap in Memetics Finance pools, before fees, counted in SOL, USDC or USDT wherever the pool holds one of them. Swaps by the protocol's own price-keeping bot, which the program charges no fee, are not counted.",
  Fees: "The trade fee every swap pays (1% of the amount swapped in on every pool today), any creator fee a pool charges on top of it, and the flat fee in SOL to open a pool.",
  Revenue: "16% of each trade fee and the flat fee in SOL to open a pool. Since 19 October 2026 the 16% is split: 10.4% of each trade fee goes to the protocol's multisig treasury and 5.6% is set aside for the fund owner named on the fee tier, the wallet of the community the protocol shares its fees with.",
  ProtocolRevenue: "10.4% of each trade fee (16% before 19 October 2026) and the flat fee in SOL to open a pool, both collected by the protocol's multisig treasury.",
  SupplySideRevenue: "84% of each trade fee, left in the pool for its liquidity providers, and any creator fee, paid to the pool's creator.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.SwapFees]: "The trade fee every swap pays, 1% of the amount swapped in on every pool today, charged in the token swapped in.",
    [LABEL.CreatorFees]: "The creator fee of pools opened with one, charged on top of the trade fee.",
    [LABEL.PoolCreationFees]: "The flat fee in SOL to open a pool.",
  },
  Revenue: {
    [LABEL.SwapFeesToTreasury]: "The protocol owner's share of each trade fee: 10.4% (16% before 19 October 2026).",
    [LABEL.SwapFeesToFundOwner]: "5.6% of each trade fee since 19 October 2026, set aside for the fund owner named on the fee tier, the wallet of the community the protocol shares its fees with.",
    [LABEL.PoolCreationFeesToTreasury]: "The flat fee in SOL to open a pool.",
  },
  ProtocolRevenue: {
    [LABEL.SwapFeesToTreasury]: "The protocol owner's share of each trade fee, 10.4% (16% before 19 October 2026), collected by the protocol's multisig treasury.",
    [LABEL.PoolCreationFeesToTreasury]: "The flat fee in SOL to open a pool, paid into the multisig treasury's wrapped SOL account.",
  },
  SupplySideRevenue: {
    [LABEL.SwapFeesToLps]: "84% of each trade fee, left in the pool for its liquidity providers.",
    [LABEL.CreatorFeesToCreators]: "Creator fees, paid to the creator of the pool that charges them.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-03", // the first pool was opened that day; the first swap was on 2026-10-08
  methodology,
  breakdownMethodology,
};

export default adapter;
