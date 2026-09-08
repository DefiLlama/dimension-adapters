import { AbiCoder, Interface, keccak256, ZeroAddress } from "ethers";
import axios from "axios";
import retry from "async-retry";
import pLimit from "p-limit";
import { FetchGetLogsOptions, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Robinhood deployment, also used by dexs/uniswap-v4.ts.
// https://robinhoodchain.blockscout.com/address/0x8366a39cc670b4001a1121b8f6a443a643e40951
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const SHROOM = "0xab093def657f15df31b33922a95e047add645b29";
const GENESIS_POOL = "0xbacecf788d2279f65da62d7bf69f4de28580a88bec56847c8d2ba6fbdd73f6eb";
const START_BLOCK = 52657452; // SHROOM genesis, 2026-09-02
// Treasury ownership confirmed by the team; never infer it from shared Pons infrastructure.
const TREASURY = new Set([
  "0xad5bc794c2829e671a7f5c135ca85ff97a62638b",
  "0xfca196eacf630f67b505023c4f2cf7eb36da2f9f",
]);
// The mainnet public RPC does not expose debug_traceTransaction. This archive
// endpoint does; operators can supply another trace-capable RPC with this env var.
const TRACE_RPC = process.env.ROBINHOOD_TRACE_RPC || "https://rpc-robinhood.blockmachine.io";
// Public endpoints reject bursts, including the CLI's two simultaneous hourly
// slots. Space requests by 1.5 seconds and retry transient failures; exhausted
// retries propagate, never producing a partial fees result.
const rpcLimit = pLimit(1);
let lastRequest = 0;
const request = <T>(fn: () => Promise<T>): Promise<T> => rpcLimit(() => retry(async () => {
  const wait = 1500 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequest = Date.now();
  return fn();
}, { retries: 3, minTimeout: 2000 }));
const LP_REVENUE = "LP Fees To Treasury";
// MU dividend payer and token verified in SHROOM_DIMENSION_HANDOFF.md; both
// are shared infrastructure. Only transfers into the confirmed treasury count.
// https://robinhoodchain.blockscout.com/address/0xEa4036B0FccDB5F90421D5b9c35E05758e40Ce18
const DISTRIBUTOR = "0xea4036b0fccdb5f90421d5b9c35e05758e40ce18";
const MU = "0xff080c8ce2e5feadaca0da81314ae59d232d4afd";
const DIVIDENDS = "MU Dividends";
const DIVIDENDS_TO_TREASURY = "MU Dividends To Treasury";
const INITIALIZE = "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)";
const MODIFY = "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)";
const iface = new Interface([
  INITIALIZE, TRANSFER, MODIFY,
  "function modifyLiquidity((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,(int24 tickLower,int24 tickUpper,int256 liquidityDelta,bytes32 salt) params,bytes hookData) returns (int256 callerDelta,int256 feesAccrued)",
]);
const coder = AbiCoder.defaultAbiCoder();
const pad = (address: string) => "0x" + address.slice(2).padStart(64, "0");
const lower = (value: string) => value.toLowerCase();
const index = (log: any): number => Number(log.logIndex ?? log.index);
const compare = (a: any, b: any) => Number(a.blockNumber) - Number(b.blockNumber) || index(a) - index(b);
const eventKey = (pool: string, args: any) => [lower(pool), lower(args.salt), args.tickLower, args.tickUpper, args.liquidityDelta].join(":");

type Trace = { type: string; from?: string; to?: string; input?: string; output?: string; error?: string; calls?: Trace[] };
type Fee = { key: string; token0: string; token1: string; amount0: bigint; amount1: bigint };

// Uniswap returns (callerDelta, feesAccrued). Only the second contains earned
// fees, excluding withdrawn principal or newly deposited funds. Both amounts
// are signed int128 packed into one int256; token decimals are handled by Balances.
// https://github.com/Uniswap/v4-core/blob/main/src/PoolManager.sol
export function feesFromTrace(trace: Trace): Fee[] {
  if (!trace || typeof trace.type !== "string") throw new Error("Missing call trace");
  const fees: Fee[] = [];
  function visit(call: Trace) {
    if (call.error) return; // Reverted calls and their children have no committed income.
    if (call.type === "CALL" && lower(call.to || "") === POOL_MANAGER &&
      lower(call.from || "") === POSITION_MANAGER && call.input?.startsWith(iface.getFunction("modifyLiquidity")!.selector)) {
      const [key, params] = iface.decodeFunctionData("modifyLiquidity", call.input);
      const pool = keccak256(coder.encode(["address", "address", "uint24", "int24", "address"], Array.from(key)));
      const [, packed] = iface.decodeFunctionResult("modifyLiquidity", call.output || "0x");
      const amount0 = BigInt.asIntN(128, BigInt(packed) >> 128n);
      const amount1 = BigInt.asIntN(128, BigInt(packed));
      if (amount0 < 0n || amount1 < 0n) throw new Error("Negative Uniswap feesAccrued");
      // Liquidity-return-delta hooks can take part of feesAccrued. Do not claim
      // the gross amount as treasury income without modelling that hook's cut.
      // Swap-only dynamic-fee hooks do not have these permission bits.
      if ((BigInt(key.hooks) & 3n) !== 0n && (amount0 || amount1))
        throw new Error(`Liquidity-return-delta hook requires attribution: ${key.hooks}`);
      fees.push({ key: eventKey(pool, params), token0: lower(key.currency0), token1: lower(key.currency1), amount0, amount1 });
    }
    for (const child of call.calls || []) visit(child);
  }
  visit(trace);
  return fees;
}

// Ownership is evaluated at the modification, not at the window's end. The
// PositionManager burns the NFT BEFORE removing liquidity, so its burn transfer
// in this transaction must retain the previous owner for the final collection.
// https://github.com/Uniswap/v4-periphery/blob/main/src/PositionManager.sol
export function treasuryOwnsAt(change: any, transfers: any[]): boolean {
  let owner = "";
  for (const transfer of transfers) {
    if (compare(transfer, change) >= 0) break;
    if (lower(transfer.args.to) === ZeroAddress && lower(transfer.transactionHash) === lower(change.transactionHash)) continue;
    owner = lower(transfer.args.to);
  }
  return TREASURY.has(owner);
}

// Receipts are measured independently of hook sweeps: distribution can happen
// later. Do not multiply a sweep by the treasury's current SHROOM balance, and
// do not count all-holder dividends as treasury income. MU Transfer does not
// identify the underlying Pons launch, so this measures actual MU receipts from
// the confirmed dividend payer, without assigning shared payouts to a pool.
export const fetchTreasuryDividends = async (options: FetchOptions) => {
  const dividends = options.createBalances();
  const logs = await request(() => options.getLogs({
    target: MU, eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)", entireLog: true, parseLog: true,
    topics: [iface.getEvent("Transfer")!.topicHash, pad(DISTRIBUTOR), [...TREASURY].map(pad)] as any,
  }));
  for (const log of logs) {
    if (lower(log.address) !== MU || lower(log.args.from) !== DISTRIBUTOR || !TREASURY.has(lower(log.args.to)))
      throw new Error("Unexpected transfer in treasury dividend query");
    // The same Transfer signature is used by ERC20 and ERC721, but ERC20 value
    // is NOT indexed. Decode MU with its ERC20 ABI below, not the NFT ABI.
    dividends.add(MU, log.args.value);
  }
  return dividends;
};

const fetch = async (options: FetchOptions) => {
  const getLogs = (params: FetchGetLogsOptions) => request(() => options.getLogs(params));
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const history = { fromBlock: START_BLOCK, cacheInCloud: true, entireLog: true, parseLog: true };
  const transferTopic = iface.getEvent("Transfer")!.topicHash;
  const wallets = [...TREASURY].map(pad);
  const transfers = new Map<string, any>();
  for (const topics of [[transferTopic, wallets], [transferTopic, null, wallets]]) {
    const logs = await getLogs({ target: POSITION_MANAGER, eventAbi: TRANSFER, topics: topics as any, ...history });
    for (const log of logs) transfers.set(`${log.transactionHash}:${index(log)}`, log);
  }
  const ownership = new Map<string, any[]>();
  for (const log of [...transfers.values()].sort(compare)) {
    const id = log.args.tokenId.toString();
    if (!ownership.has(id)) ownership.set(id, []);
    ownership.get(id)!.push(log);
  }
  if (ownership.size) {
    // Initialize is immutable and survives NFT burns. Enumerate SHROOM on both
    // sides, then restrict every modification query to those pool IDs. No token
    // transfer scans, no current ownerOf calls, and no discarded burned NFTs.
    const pools = new Set<string>();
    const initTopic = iface.getEvent("Initialize")!.topicHash;
    for (const topics of [[initTopic, null, pad(SHROOM)], [initTopic, null, null, pad(SHROOM)]]) {
      const logs = await getLogs({ target: POOL_MANAGER, eventAbi: INITIALIZE, topics: topics as any, ...history });
      for (const log of logs) if (lower(log.args.id) !== GENESIS_POOL) pools.add(lower(log.args.id));
    }
    const transactions = new Map<string, any[]>();
    // Bound OR filters to 50 pool IDs per request; this is an RPC batch size,
    // not a fee rate or coverage limit. Every discovered pool is queried.
    const ids = [...pools].sort();
    for (let i = 0; i < ids.length; i += 50) {
      const logs = await getLogs({
        target: POOL_MANAGER, eventAbi: MODIFY, entireLog: true, parseLog: true,
        topics: [iface.getEvent("ModifyLiquidity")!.topicHash, ids.slice(i, i + 50), pad(POSITION_MANAGER)] as any,
      });
      for (const log of logs) {
        const tx = lower(log.transactionHash);
        if (!transactions.has(tx)) transactions.set(tx, []);
        transactions.get(tx)!.push(log);
      }
    }
    for (const [tx, changes] of transactions) {
      changes.sort(compare);
      const owns = (change: any) => treasuryOwnsAt(change, ownership.get(BigInt(change.args.salt).toString()) || []);
      if (!changes.some(owns)) continue;
      const trace = await request(async () => {
        const response = await axios.post(TRACE_RPC, {
          jsonrpc: "2.0", id: 1, method: "debug_traceTransaction", params: [tx, { tracer: "callTracer" }],
        }, { timeout: 60_000, validateStatus: () => true });
        // This endpoint meters compute units, not just requests. Honour its
        // reset interval instead of spending all retries inside the same minute.
        if (response.status === 429 || response.data?.error?.code === -32029) {
          const delay = Number(response.data?.error?.data?.retry_after_ms) || Number(response.headers["retry-after"]) * 1000 || 30_000;
          await new Promise(resolve => setTimeout(resolve, Math.min(60_000, Math.max(1500, delay))));
          throw new Error(`Trace ${tx}: archive compute quota exhausted`);
        }
        if (response.status !== 200) throw new Error(`Trace ${tx}: HTTP ${response.status}`);
        const data = response.data;
        if (data.error) throw new Error(`Trace ${tx}: ${JSON.stringify(data.error)}`);
        if (!data.result || data.result.error) throw new Error(`Missing or reverted trace for ${tx}`);
        return data.result as Trace;
      });
      const queues = new Map<string, Fee[]>();
      for (const fee of feesFromTrace(trace)) {
        if (!queues.has(fee.key)) queues.set(fee.key, []);
        queues.get(fee.key)!.push(fee);
      }
      for (const change of changes) {
        const fee = queues.get(eventKey(change.args.id, change.args))?.shift();
        if (!fee) throw new Error(`Trace does not account for ModifyLiquidity ${tx}:${index(change)}`);
        if (!owns(change)) continue;
        for (const [token, amount] of [[fee.token0, fee.amount0], [fee.token1, fee.amount1]] as const) {
          dailyFees.add(token, amount, METRIC.LP_FEES);
          dailyRevenue.add(token, amount, LP_REVENUE);
          dailyProtocolRevenue.add(token, amount, LP_REVENUE);
        }
      }
    }
  }
  const dividends = await fetchTreasuryDividends(options);
  dailyFees.add(dividends, DIVIDENDS);
  dailyRevenue.add(dividends, DIVIDENDS_TO_TREASURY);
  dailyProtocolRevenue.add(dividends, DIVIDENDS_TO_TREASURY);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const description = "Earned fees realized when a treasury-owned SHROOM Uniswap v4 position is modified, including collection, withdrawal, burn, and fees offset against new deposits. Read from PoolManager feesAccrued return values; principal is excluded. Ownership is reconstructed at the event. The genesis hook pool is excluded.";
const dividendDescription = "MU dividends actually received from the Pons distributor by the two confirmed treasury wallets, recognized on receipt. Excludes transfers to other holders, arbitrary MU deposits, and transfers between treasury wallets. Shared MU payouts do not encode which launch generated them.";
const treasuryDescription = "Treasury income only: earned fees from treasury-owned SHROOM LP positions plus actual MU dividend receipts. Token balances and returned LP principal are not income. All-holder SHROOM dividend allocations are reported separately in shroom.ts; do not sum the two scopes.";
const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, chains: [CHAIN.ROBINHOOD], start: "2026-09-02", fetch,
  isExpensiveAdapter: true, // One historical call trace per transaction touching treasury positions.
  // LP income overlaps Uniswap; treasury MU receipts are also contained in the
  // token dividend stream. This treasury view must not be added to shroom.ts.
  doublecounted: true,
  methodology: { Fees: treasuryDescription, Revenue: treasuryDescription, ProtocolRevenue: treasuryDescription },
  breakdownMethodology: {
    Fees: { [METRIC.LP_FEES]: description, [DIVIDENDS]: dividendDescription },
    Revenue: { [LP_REVENUE]: description, [DIVIDENDS_TO_TREASURY]: dividendDescription },
    ProtocolRevenue: { [LP_REVENUE]: description, [DIVIDENDS_TO_TREASURY]: dividendDescription },
  },
};
export default adapter;
