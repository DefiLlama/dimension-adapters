import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { addOneToken } from "../../helpers/prices";
import { httpGet } from "../../utils/fetchURL";

// Choice v2: a PancakeSwap Infinity fork on Injective EVM (chain id 1776).
// Addresses: https://github.com/choice-exchange/choice_v2_contracts/blob/main/deployments/injective_mainnet.json
// Same pool managers and first blocks as the Choice TVL adapter (DefiLlama-Adapters/projects/choice-exchange).
const POOL_MANAGERS = [
  {
    target: "0x6A4085Bb379e5213Df84Dc2dD52562559602b029", // CLPoolManager
    fromBlock: 182158326, // first block with an Initialize event
    initializeAbi:
      "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)",
    swapAbi:
      "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
  },
  {
    target: "0xfc6dd227f928Bf3396ff38Da00e19718f9CE7d7e", // BinPoolManager
    fromBlock: 182158543,
    initializeAbi:
      "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint24 activeId)",
    swapAbi:
      "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint24 activeId, uint24 fee, uint16 protocolFee)",
  },
];

// Pools excluded as wash volume.
const BLACKLIST_POOL_IDS = new Set([
  "0x20edb0d8499e57195d8cc4aff2176b2a21557db8850cab9cf96388d703844a16",
  "0x9bea96ab2176706bd868c4d5bbeef3b4f6c1f10d2638a127001f944660442e0e",
  "0xaa206e6383c9743016bdd4436cc458054b4baf782e6426c87dacc3d1aac5b30d",
]);

// fee and protocolFee are in hundredths of a bip (1e6 = 100%), same as PancakeSwap Infinity
const FEE_DENOMINATOR = 1_000_000n;

// the sdk cannot resolve an Injective block from a timestamp, so use the llama block endpoint
// (same approach as fees/sprout)
const getBlock = async (timestamp: number): Promise<number> => {
  const { height } = await httpGet(`https://coins.llama.fi/block/${CHAIN.INJECTIVE}/${timestamp}`);
  if (!height) throw new Error(`Choice: no injective block for timestamp ${timestamp}`);
  return height;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swapFees = options.createBalances();
  const protocolFees = options.createBalances();

  const fromBlock = await getBlock(options.fromTimestamp);
  const toBlock = await getBlock(options.toTimestamp);
  const blacklistTokens = getDefaultDexTokensBlacklisted(options.chain);

  for (const manager of POOL_MANAGERS) {
    // poolId -> currencies
    const initLogs = await options.getLogs({
      target: manager.target,
      eventAbi: manager.initializeAbi,
      fromBlock: manager.fromBlock,
      toBlock,
      cacheInCloud: true,
    });
    const pools: Record<string, { currency0: string; currency1: string }> = {};
    initLogs.forEach((log: any) => {
      const id = String(log.id).toLowerCase();
      if (BLACKLIST_POOL_IDS.has(id)) return;
      pools[id] = { currency0: log.currency0, currency1: log.currency1 };
    });

    const swapLogs = await options.getLogs({
      target: manager.target,
      eventAbi: manager.swapAbi,
      fromBlock,
      toBlock,
    });

    swapLogs.forEach((log: any) => {
      const pool = pools[String(log.id).toLowerCase()];
      if (!pool) return;
      const { currency0, currency1 } = pool;
      if (blacklistTokens?.includes(currency0.toLowerCase()) || blacklistTokens?.includes(currency1.toLowerCase())) return;

      const amount0 = BigInt(log.amount0);
      const amount1 = BigInt(log.amount1);
      const fee = BigInt(log.fee);
      const protocolFee = BigInt(log.protocolFee);

      // addOneToken counts one side of the swap (the core asset if there is one) and takes the absolute value
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: currency0, amount0, token1: currency1, amount1 });
      addOneToken({ chain: options.chain, balances: swapFees, token0: currency0, amount0: (amount0 * fee) / FEE_DENOMINATOR, token1: currency1, amount1: (amount1 * fee) / FEE_DENOMINATOR });
      addOneToken({ chain: options.chain, balances: protocolFees, token0: currency0, amount0: (amount0 * protocolFee) / FEE_DENOMINATOR, token1: currency1, amount1: (amount1 * protocolFee) / FEE_DENOMINATOR });
    });
  }

  const dailyFees = swapFees.clone(1, METRIC.SWAP_FEES);
  const dailyProtocolRevenue = protocolFees.clone(1, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = swapFees.clone(1);
  dailySupplySideRevenue.subtract(protocolFees);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue.clone(1, METRIC.LP_FEES),
  };
};

const methodology = {
  Volume: "Swap volume in Choice v2 pools on Injective EVM (concentrated-liquidity and liquidity-book pools), counted from the pool managers' Swap events. Excludes three pools identified as wash volume, and Choice v1 (CosmWasm) pools.",
  Fees: "Swap fees paid by traders on Choice v2 pools. Fees taken by third-party pool hooks, such as the Sprout launchpad hook, are not included.",
  UserFees: "Swap fees paid by traders on Choice v2 pools, charged on top of the swap amount.",
  Revenue: "The share of swap fees that Choice's fee controllers send to the protocol treasury. It is 0 while the protocol fee is switched off.",
  ProtocolRevenue: "The share of swap fees that Choice's fee controllers send to the protocol treasury. It is 0 while the protocol fee is switched off.",
  SupplySideRevenue: "Swap fees paid to liquidity providers, which is all swap fees minus the protocol share.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Swap fees charged on Choice v2 pools." },
  UserFees: { [METRIC.SWAP_FEES]: "Swap fees paid by traders on Choice v2 pools." },
  Revenue: { [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees set by the Choice fee controllers." },
  ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees set by the Choice fee controllers." },
  SupplySideRevenue: { [METRIC.LP_FEES]: "Swap fees remaining after the protocol share, paid to liquidity providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-09-08", // first day with Swap events
  methodology,
  breakdownMethodology,
};

export default adapter;
