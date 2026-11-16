import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { isCoreAsset } from "../helpers/prices";

// Production Infinity manager: https://chainscan.0g.ai/address/0xaabd31f24914b48daea998e69683225e289d08b0
const deployment = {
  manager: "0xaabd31f24914b48daea998e69683225e289d08b0",
  // Production launch hook. https://chainscan.0g.ai/address/0x809acd73ac30b4e2d2dfd7d35b1fda850dcd4334
  hook: "0x809acd73ac30b4e2d2dfd7d35b1fda850dcd4334",
  // Launch fee splitter. https://chainscan.0g.ai/address/0x500acfbb2199d35ab1aa87736665d76c56bf633e
  splitter: "0x500acfbb2199d35ab1aa87736665d76c56bf633e",
  // Manager creation. https://chainscan.0g.ai/tx/0xc8108c1b02fedd0ac718533ce80b0f7979d0f1dc996c61b90c992eb5c4cc6d74
  managerStartBlock: 45552804,
  // Splitter creation. https://chainscan.0g.ai/tx/0x61ed07ba7b09b683bdec439e088f54b4109bf115ae631331d25cde644ac3842f
  splitterStartBlock: 45552817,
  quoteCurrencies: [
    // Native 0G uses CurrencyLibrary.NATIVE. https://github.com/pancakeswap/infinity-core/blob/d0e879334da8ea789a895d864dbe34259ea9fb65/src/types/Currency.sol
    "0x0000000000000000000000000000000000000000",
    // USDC.e. https://chainscan.0g.ai/address/0x1f3aa82227281ca364bfb3d253b0f1af1da6473e
    "0x1f3aa82227281ca364bfb3d253b0f1af1da6473e",
    // W0G. https://chainscan.0g.ai/address/0x1cd0690ff9a693f5ef2dd976660a8dafc81a109c
    "0x1cd0690ff9a693f5ef2dd976660a8dafc81a109c",
  ],
};

const events = {
  initialize: "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)",
  swap: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
  configured: "event PoolConfigured(bytes32 indexed poolId, uint16 protocolBps, uint16 creatorBps)",
  charge: "event ChargeTaken(bytes32 indexed poolId, address indexed router, bool isBuy, uint256 quoteAmount, uint256 baseFee, uint256 openingFee, uint256 creatorTax, address currency)",
};

type Pool = { currency0: string; currency1: string; hooks: string; volumeCurrency: string; excluded: boolean };
type Swap = { id: string; amount0: bigint; amount1: bigint; fee: bigint; protocolFee: bigint };
type Charge = { poolId: string; currency: string; isBuy: boolean; baseFee: bigint; openingFee: bigint; creatorTax: bigint };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const toBlock = await options.getToBlock();
  const blacklist = new Set(getDefaultDexTokensBlacklisted(options.chain));
  const pools = new Map<string, Pool>();
  const protocolShares = new Map<string, bigint>();

  if (toBlock >= deployment.managerStartBlock) {
    const initialized = await options.getLogs({
      target: deployment.manager, fromBlock: deployment.managerStartBlock, toBlock,
      eventAbi: events.initialize, cacheInCloud: true,
    });
    for (const log of initialized) {
      const currency0 = log.currency0.toLowerCase();
      const currency1 = log.currency1.toLowerCase();
      const volumeCurrency = deployment.quoteCurrencies.find(currency => currency === currency0 || currency === currency1)
        ?? (isCoreAsset(options.chain, currency0) ? currency0 : currency1);
      pools.set(log.id.toLowerCase(), {
        currency0, currency1, volumeCurrency, hooks: log.hooks.toLowerCase(),
        excluded: blacklist.has(currency0) || blacklist.has(currency1),
      });
    }
    if (toBlock >= deployment.splitterStartBlock) {
      const configured = await options.getLogs({
        target: deployment.splitter, fromBlock: deployment.splitterStartBlock, toBlock,
        eventAbi: events.configured, cacheInCloud: true,
      });
      for (const log of configured) protocolShares.set(log.poolId.toLowerCase(), BigInt(log.protocolBps));
    }

    const getPool = (id: string) => {
      const pool = pools.get(id.toLowerCase());
      if (!pool) throw new Error(`Comfy pool ${id} is missing its Initialize event`);
      return pool;
    };
    const swaps: Swap[] = await options.getLogs({ target: deployment.manager, eventAbi: events.swap });
    for (const swap of swaps) {
      const pool = getPool(swap.id);
      if (pool.excluded) continue;
      const amount0 = BigInt(swap.amount0);
      const amount1 = BigInt(swap.amount1);
      const volume = pool.volumeCurrency === pool.currency0 ? amount0 : amount1;
      dailyVolume.add(pool.volumeCurrency, volume < 0n ? -volume : volume);
      const input = amount0 < 0n ? -amount0 : -amount1;
      const inputCurrency = amount0 < 0n ? pool.currency0 : pool.currency1;
      // Swap reports rates, not the exact fee rounded at each crossed tick. Protocol fees are included in fee.
      // Rates use millionths. https://github.com/pancakeswap/infinity-core/blob/d0e879334da8ea789a895d864dbe34259ea9fb65/src/libraries/ProtocolFeeLibrary.sol
      const fees = input * BigInt(swap.fee) / 1_000_000n;
      const protocolFees = input * BigInt(swap.protocolFee) / 1_000_000n;
      dailyFees.add(inputCurrency, fees, "Pool Swap Fees");
      dailyRevenue.add(inputCurrency, protocolFees, "Pool Swap Fees To Treasury");
      dailySupplySideRevenue.add(inputCurrency, fees - protocolFees, "Pool Swap Fees To Liquidity Providers");
    }

    const charges: Charge[] = await options.getLogs({ target: deployment.hook, eventAbi: events.charge });
    for (const charge of charges) {
      const pool = getPool(charge.poolId);
      if (pool.excluded) continue;
      const currency = charge.currency.toLowerCase();
      if (pool.hooks !== deployment.hook || (currency !== pool.currency0 && currency !== pool.currency1))
        throw new Error(`Comfy charge does not match pool ${charge.poolId}`);
      const protocolBps = protocolShares.get(charge.poolId.toLowerCase());
      if (protocolBps === undefined) throw new Error(`Comfy pool ${charge.poolId} is missing its PoolConfigured event`);
      const baseFee = BigInt(charge.baseFee);
      const openingFee = BigInt(charge.openingFee);
      const creatorTax = BigInt(charge.creatorTax);
      const fees = baseFee + openingFee + creatorTax;
      // The splitter rounds aggregated pending fees at sweep time. This estimates entitlement on each trade date.
      // PoolConfigured.protocolBps uses basis points, where 10,000 is 100%. The splitter is linked in deployment.
      const protocolFees = (baseFee + openingFee) * protocolBps / 10_000n;
      dailyFees.add(currency, baseFee, "Launch Base Fees");
      dailyFees.add(currency, openingFee, "Launch Opening Fees");
      dailyFees.add(currency, creatorTax, "Launch Creator Fees");
      dailyRevenue.add(currency, protocolFees, "Launch Fees To Treasury");
      dailySupplySideRevenue.add(currency, fees - protocolFees, "Launch Fees To Creators");
      // Buy input reaches the core after the hook charge. Sell quote output is already gross of that charge.
      if (charge.isBuy && currency === pool.volumeCurrency) dailyVolume.add(currency, fees);
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const treasuryMethodology = {
  "Pool Swap Fees To Treasury": "Protocol swap fees estimated from each swap's input and emitted protocol rate.",
  "Launch Fees To Treasury": "Accrued protocol share of base and opening charges, using each pool's configured split and per-trade integer rounding.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OG],
  start: "2026-09-28",
  fetch,
  methodology: {
    Volume: "Quote-side core swap volume from non-blacklisted pools on Comfy's production manager, plus Comfy launch-hook buy charges, excluding adjustments from other hooks.",
    Fees: "Estimated core swap fees on Comfy's production manager plus exact charges from its configured launch hook, excluding extra charges from other hooks and subject to core tick rounding.",
    Revenue: "Accrued treasury share of pool and launch fees at trade time; per-trade rounding can differ from later splitter sweeps.",
    ProtocolRevenue: "Accrued treasury share of pool and launch fees at trade time; per-trade rounding can differ from later splitter sweeps.",
    SupplySideRevenue: "Pool fees allocated to liquidity providers and launch fees allocated to creators, including their recipient and compute allocations.",
  },
  breakdownMethodology: {
    Fees: {
      "Pool Swap Fees": "Estimated pool swap fees, including the iAI pool's dynamic opening fee.",
      "Launch Base Fees": "Base charges emitted by the launch hook.",
      "Launch Opening Fees": "Opening charges emitted by the launch hook.",
      "Launch Creator Fees": "Creator charges emitted by the launch hook, allocated entirely to creators.",
    },
    Revenue: treasuryMethodology,
    ProtocolRevenue: treasuryMethodology,
    SupplySideRevenue: {
      "Pool Swap Fees To Liquidity Providers": "Estimated pool swap fees after the core protocol fee.",
      "Launch Fees To Creators": "Creator share of base and opening charges plus all creator charges, including creator-funded compute.",
    },
  },
};

export default adapter;
