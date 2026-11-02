import { api2, getProvider } from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

// Fynd AMM pools are Ekubo v3 pools that use Fynd's SignedExclusiveSwap extension.
// Docs: https://docs.fynd.xyz/get-started/fynd-amm
// Extension source: https://github.com/EkuboProtocol/evm-contracts/blob/main/src/extensions/SignedExclusiveSwap.sol
const CORE = "0x00000000000014aA86C5d3c41765bb24e11bd701";
const EXTENSION_V1 = "0x55b703eED01b35641963da2FB2E14885993605A3";
const EXTENSION = "0x550CFe1292d0D9c0d28f232b3F42Edb4439B1D09";

// LPs hold their positions through Ekubo's Positions contract, which keeps SWAP_PROTOCOL_FEE_X64 of collected fees.
const POSITIONS = "0x02D9876A21AF7545f8632C3af76eC90b5ad4b66D";
const POSITIONS_192_BIT_IDS = "0xA2971E0C37cFdb13aE8440A0C94Ef1A1af39e326";

// fromBlock is the block in which the first Fynd AMM pool was initialized on that chain.
const chainConfig: Record<string, { start: string; fromBlock: number; extensions: string[]; positions: string }> = {
  [CHAIN.ETHEREUM]: { start: "2026-08-05", fromBlock: 25689059, extensions: [EXTENSION_V1, EXTENSION], positions: POSITIONS },
  [CHAIN.ROBINHOOD]: { start: "2026-09-25", fromBlock: 72277109, extensions: [EXTENSION], positions: POSITIONS },
  [CHAIN.BASE]: { start: "2026-10-27", fromBlock: 53151641, extensions: [EXTENSION], positions: POSITIONS },
  [CHAIN.BSC]: { start: "2026-10-27", fromBlock: 130064169, extensions: [EXTENSION], positions: POSITIONS_192_BIT_IDS },
};

// Test pools that are not listed in the Fynd app.
const EXCLUDED_POOLS = new Set([
  "0x22c2b655277ac0d151ab5844d49f3ddf6118e555e35be89d3cf3f476647af38b", // ethereum USDC/WETH
  "0x29936f43df20cce7583ff081144b26fc8984cd38d3f413f04695640928729524", // robinhood USDG/UBIK
  "0xf893e7a59d7645501877e680332860a61f784332e7e722a5e9bb9a8cbad38656", // robinhood SPY/USDG
]);

const abis = {
  poolInitialized: "event PoolInitialized(bytes32 poolId, (address token0, address token1, bytes32 config) poolKey, int32 tick, uint96 sqrtRatio)",
  feesAccumulated: "event FeesAccumulated(bytes32 poolId, uint128 amount0, uint128 amount1)",
  poolStateUpdated: "event PoolStateUpdated(bytes32 indexed poolId, bytes32 poolState)",
  swapProtocolFee: "function SWAP_PROTOCOL_FEE_X64() view returns (uint64)",
};

// Fees are 64-bit fixed point fractions: 2^64 is 100%.
const Q64 = 2n ** 64n;
const UINT64_MASK = Q64 - 1n;
// Core logs every swap as an anonymous log0 of 116 bytes: locker (20) | poolId (32) | balanceUpdate (32) | stateAfter (32).
const SWAP_LOG_BYTES = 116;

// Public RPCs cap the block range of a raw eth_getLogs call; 5,000 blocks is accepted on every chain here.
const LOG_BLOCK_RANGE = 5_000;

const toInt128 = (value: bigint) => BigInt.asIntN(128, value);

async function getCoreLogs(chain: string, fromBlock: number, toBlock: number) {
  const ranges: [number, number][] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE)
    ranges.push([start, Math.min(start + LOG_BLOCK_RANGE - 1, toBlock)]);
  const { results, errors } = await PromisePool.withConcurrency(2)
    .for(ranges)
    .process(async ([from, to]) => {
      // Public RPCs sometimes rate-limit a range that succeeds on the next attempt.
      for (let attempt = 1; ; attempt++) {
        try {
          return await getProvider(chain).getLogs({ address: CORE, fromBlock: from, toBlock: to });
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
        }
      }
    });
  if (errors.length) throw errors[0];
  return results.flat();
}

const fetch = async (options: FetchOptions) => {
  const { fromBlock, extensions, positions } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [startBlock, endBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  // The top 20 bytes of a pool config are its extension, so this finds every Fynd AMM pool on-chain.
  const extensionSet = new Set(extensions.map((extension) => BigInt(extension)));
  const initialized = await options.getLogs({ target: CORE, eventAbi: abis.poolInitialized, fromBlock, toBlock: endBlock, cacheInCloud: true });
  const pools: Record<string, { token0: string; token1: string }> = {};
  initialized.forEach(({ poolId, poolKey }: any) => {
    const id = poolId.toLowerCase();
    if (!extensionSet.has(BigInt(poolKey.config) >> 96n) || EXCLUDED_POOLS.has(id)) return;
    pools[id] = { token0: poolKey.token0, token1: poolKey.token1 };
  });
  const poolIds = Object.keys(pools);
  if (!poolIds.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // Volume: Core's swap log has no topics, so getLogs cannot select it by event. Read Core's raw logs for the
  // period and keep the swaps on Fynd AMM pools. The extension runs every Fynd AMM swap, so it is the locker.
  const lockers = new Set(extensions.map((extension) => extension.toLowerCase()));
  const isFyndSwap = (log: { topics: readonly string[]; data: string }) =>
    log.topics.length === 0 && (log.data.length - 2) / 2 === SWAP_LOG_BYTES
    && lockers.has("0x" + log.data.slice(2, 42)) && !!pools["0x" + log.data.slice(42, 106)];
  const rawLogs = await getCoreLogs(options.chain, startBlock, endBlock);
  const swaps = rawLogs
    .filter(isFyndSwap)
    .map((log) => ({
      txHash: log.transactionHash,
      poolId: "0x" + log.data.slice(42, 106),
      balanceUpdate: BigInt("0x" + log.data.slice(106, 170)),
    }));

  // The fee logs come from DefiLlama's indexer. The first swap on a pool in a new block also credits the pool's
  // saved fees, so a fee log in a swap transaction must have a raw swap log. If it has none, the RPC
  // returned incomplete raw logs, and the period fails instead of under-counting volume.
  const feeLogs = await options.getLogs({ target: CORE, eventAbi: abis.feesAccumulated, onlyArgs: false });
  const fyndFeeLogs = feeLogs.filter(({ args }: any) => pools[args.poolId.toLowerCase()]);
  const swapTxs = new Set(swaps.map(({ txHash }) => txHash.toLowerCase()));
  const unmatchedTxs = [...new Set(fyndFeeLogs.map(({ transactionHash }: any) => transactionHash.toLowerCase()))].filter((tx) => !swapTxs.has(tx));
  if (unmatchedTxs.length) {
    const receipts = await getTxReceiptsWithRetry(options.chain, unmatchedTxs);
    receipts.forEach((receipt, i) => {
      if (!receipt) throw new Error(`fynd-amm: no receipt for ${unmatchedTxs[i]}`);
      const missedSwap = receipt.logs.some((log) => log.address.toLowerCase() === CORE.toLowerCase() && isFyndSwap(log));
      if (missedSwap) throw new Error(`fynd-amm: the RPC returned incomplete Core logs, the swap in ${unmatchedTxs[i]} is missing`);
    });
  }

  // balanceUpdate holds delta0 (high 128 bits) and delta1 (low 128 bits) from the pool's view: the positive
  // delta is the token the trader paid in. Fynd takes its fee from the output token, so the input is gross.
  swaps.forEach(({ poolId, balanceUpdate }) => {
    const { token0, token1 } = pools[poolId];
    const delta0 = toInt128(balanceUpdate >> 128n);
    const delta1 = toInt128(balanceUpdate);
    if (delta0 > 0n) dailyVolume.add(token0, delta0);
    else if (delta1 > 0n) dailyVolume.add(token1, delta1);
  });

  // Fees: the extension keeps its owner fee and then credits the LP share to the pool with Core.accumulateAsFees,
  // which emits FeesAccumulated. In the same transaction the extension emits PoolStateUpdated, whose state holds
  // the pool's owner fee in its low 64 bits, so each fee log is matched to the owner fee that applied to it.
  if (!fyndFeeLogs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const stateLogs = await options.getLogs({ targets: extensions, eventAbi: abis.poolStateUpdated, onlyArgs: false });
  const ownerFees: Record<string, bigint> = {};
  stateLogs.forEach(({ args, transactionHash }: any) => {
    ownerFees[`${transactionHash.toLowerCase()}-${args.poolId.toLowerCase()}`] = BigInt(args.poolState) & UINT64_MASK;
  });
  // SWAP_PROTOCOL_FEE_X64 is immutable in Positions, so the latest block gives the rate for every period.
  const protocolFeeX64 = BigInt(await api2.abi.call({ chain: options.chain, target: positions, abi: abis.swapProtocolFee }));

  fyndFeeLogs.forEach(({ args: { poolId, amount0, amount1 }, transactionHash }: any) => {
    const id = poolId.toLowerCase();
    const { token0, token1 } = pools[id];
    const ownerFeeX64 = ownerFees[`${transactionHash.toLowerCase()}-${id}`];
    if (ownerFeeX64 === undefined) throw new Error(`fynd-amm: no PoolStateUpdated for pool ${id} in ${transactionHash}`);
    ([[token0, BigInt(amount0)], [token1, BigInt(amount1)]] as [string, bigint][]).forEach(([token, lpFees]) => {
      if (lpFees === 0n) return;
      // lpFees = swapFees × (1 − ownerFee), so the swap fee is grossed up from the LP share.
      const swapFees = (lpFees * Q64) / (Q64 - ownerFeeX64);
      const ekuboFees = (lpFees * protocolFeeX64) / Q64;
      dailyFees.add(token, swapFees, METRIC.SWAP_FEES);
      dailyRevenue.add(token, swapFees - lpFees, "Swap Fees To Fynd");
      dailySupplySideRevenue.add(token, lpFees - ekuboFees, METRIC.LP_FEES);
      dailySupplySideRevenue.add(token, ekuboFees, "Swap Fees To Ekubo Protocol");
    });
  });

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Input amount of every swap on Fynd AMM pools, read from Ekubo Core swap logs. Three unlisted test pools are excluded.",
  Fees: "Swap fees paid by traders. Fynd sets the fee of each swap, and the SignedExclusiveSwap extension takes it from the output token.",
  UserFees: "Swap fees paid by traders.",
  Revenue: "The owner fee that Fynd keeps from each swap fee (20% on current pools).",
  ProtocolRevenue: "The owner fee that Fynd keeps from each swap fee (20% on current pools).",
  SupplySideRevenue: "The rest of the swap fee goes to the pool: in-range LPs receive it, minus the Ekubo Positions protocol fee (10%) taken when they collect.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on Fynd AMM pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on Fynd AMM pools.",
  },
  Revenue: {
    "Swap Fees To Fynd": "Owner fee kept by the SignedExclusiveSwap extension for Fynd.",
  },
  ProtocolRevenue: {
    "Swap Fees To Fynd": "Owner fee kept by the SignedExclusiveSwap extension for Fynd.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap fees earned by in-range liquidity providers after the Ekubo protocol fee.",
    "Swap Fees To Ekubo Protocol": "Ekubo Positions protocol fee on the fees that LPs collect.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  // Ekubo's adapter also counts these swaps, because Fynd AMM pools are Ekubo pools.
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
