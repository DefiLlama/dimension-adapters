import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";
import { AbiCoder, keccak256 } from "ethers";

const CORE_CONTRACTS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x3cb3D9E659653de02D8e3Aecd4963Ba1Ae429682",
  [CHAIN.BSC]: "0x920b4Ee4970CFE1ef523a0679200f9d9b2F87B2c",
  [CHAIN.BASE]: "0x0F2C33F406D58144Dec03FCdb69571249F0b0286",
  [CHAIN.MEGAETH]: "0x695e175c9704432cdFB98e3C193966F95a5F119D",
  [CHAIN.ROBINHOOD]: "0x6EC95a3C6C7b8368C9bF37Ff664672E55df3550d",
};

const ROUTER_CONTRACTS: Record<string, string[]> = {
  [CHAIN.BASE]: ["0xd8Ba9D1a99Fc21f0ECA24e9b85737c28A194a4E2"],
  [CHAIN.ROBINHOOD]: [
    "0x8876789976decbfcbbbe364623c63652db8c0904", // UniversalRouter
    "0xCaf681a66D020601342297493863E78C959E5cb2", // SwapRouter02
  ],
};

const FLASH_HOOKS: Record<string, Set<string>> = {
  [CHAIN.BASE]: new Set(["0x4d667e420bd4a42969cb27251a3f9a24661fd0cc"]),
  [CHAIN.ROBINHOOD]: new Set(["0x2485f30207230128276da25ca030c77ea3ddd0cc"]),
};

const chainConfig: Record<string, { start: string; fromBlock: number }> = {
  [CHAIN.ETHEREUM]: { start: "2025-11-17", fromBlock: 23820626 },
  [CHAIN.BSC]: { start: "2025-11-17", fromBlock: 68536068 },
  [CHAIN.BASE]: { start: "2025-11-17", fromBlock: 38305943 },
  [CHAIN.MEGAETH]: { start: "2026-02-09", fromBlock: 7852141 },
  [CHAIN.ROBINHOOD]: { start: "2026-07-09", fromBlock: 4791637 },
};

const ABI = {
  bought:
    "event Bought(address indexed buyer, address indexed memeToken, address referrer, uint256 amountIn, uint256 amountOut, uint256 amountOwnerFee, uint256 amountSubBoardFee, uint256 amountMemeTokenOwnerFee, uint256 amountReferralFee, uint256 volumn, uint256 virtualReserveETH, uint256 virtualReserveToken, bool isHardCapReached, uint8 decimals, uint256 virtualReserveETHHardcap, uint256 virtualReserveETHSoftcap)",
  sold:
    "event Sold(address indexed seller, address indexed memeToken, uint256 amountIn, uint256 amountOut, uint256 amountOwnerFee, uint256 amountSubBoardFee, uint256 amountMemeTokenOwnerFee, uint256 volumn, uint256 virtualReserveETH, uint256 virtualReserveToken, bool isHardCapReached, uint8 decimals, uint256 virtualReserveETHHardcap, uint256 virtualReserveETHSoftcap)",
  flashV3Created:
    "event FlashLaunchV3TokenCreated(address token, (address positionManager, uint24 feeTier, uint8 decimals, bool isTokenBurn, uint8 _padding1, uint256 virtualEth, uint256 totalSupply, address baseToken, uint8 _padding2, uint256 maxWalletAmount, uint256 maxTxAmount, uint256 protectBlocks, uint160 sqrtPriceX96_1, uint8 _padding3, uint160 sqrtPriceX96_2, uint8 _padding4, int24 tickLower_1, int24 tickUpper_1, int24 tickLower_2, int24 tickUpper_2, uint8 _padding5) poolInitialData, (address owner, bool isTokenBurn, uint8 _padding1, bytes32 subBoard, string metaData, address positionManager, uint8 _padding2, uint256 poolId, address pool) flashLaunchV3Pool)",
  flashV4Created:
    "event FlashLaunchV4TokenCreated(address token, (address positionManager, uint24 feeTier, uint8 decimals, bool isTokenBurn, uint8 _padding1, uint256 virtualEth, uint256 totalSupply, address baseToken, uint8 _padding2, uint256 maxWalletAmount, uint256 maxTxAmount, uint256 protectBlocks, uint160 sqrtPriceX96_1, uint8 _padding3, uint160 sqrtPriceX96_2, uint8 _padding4, int24 tickLower_1, int24 tickUpper_1, int24 tickLower_2, int24 tickUpper_2, uint8 _padding5) poolInitialData, (address owner, bool isTokenBurn, uint8 _padding1, address baseToken, uint8 _padding2, bytes32 subBoard, string metaData, address positionManager, uint8 _padding3, uint256 poolId, address hooks, (bool hasV4Hook, (uint16 liquidityFeeBps, uint16 buybackFeeBps, uint16 rewardFeeBps, address[] customWallets, uint16[] customWalletBps) hookFeeDistributionConfig, uint256 feeThreshold, address rewardToken, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) rewardPoolKey, uint8 feeKind, uint24 staticPoolFeeBpsBuy, uint24 staticPoolFeeBpsSell, uint24 hookFeeBpsBuy, uint24 hookFeeBpsSell, (uint24 minBaseFeeBpsBuy, uint24 minBaseFeeBpsSell, uint24 maxBaseFeeBpsBuy, uint24 maxBaseFeeBpsSell, uint32 baseFeeFactorBuy, uint32 baseFeeFactorSell, uint24 defaultBaseFeeBpsBuy, uint24 defaultBaseFeeBpsSell, uint32 surgeDecayPeriodSeconds, uint32 surgeMultiplierPpm, bool perSwapMode, uint32 capAutoTuneStepPpm, uint32 capAutoTuneIntervalSeconds) dynamicFeeConfig, (uint16[] buyFeesBps, uint16[] sellFeesBps, uint256[] buyFeeTierAmountLevels, uint256[] sellFeeTierAmountLevels) tieredFeeConfig, uint48 protectPeriod, uint256 maxBuyPerOrigin, bool isAntiSandwich, uint32 cooldownSeconds, uint24 penaltyFeeBps, (uint32 volumeIntervalSeconds, uint256[] volumeLevels, uint16[] volumeMultiplierBps) volumeConfig) v4HookData) flashLaunchV4Pool)",
  finalizedV3:
    "event LogMemeTokenLPV3Locked(address memeToken, address positionManager, uint256 tokenId, uint24 fee, int24 tickSpacing, address pair)",
  finalizedV4:
    "event LogMemeTokenLPV4Locked(address memeToken, address positionManager, uint256 poolId, uint24 fee, int24 tickSpacing, address hooks)",
  routerAllowed:
    "event LogRouterOrPositionManagerAllowedChanged(address routerOrPositionManager, uint256 isAllowed, address poolManager)",
  v3Swap:
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  v4Swap:
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  pcsSwap:
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
  token0: "function token0() view returns (address)",
  token1: "function token1() view returns (address)",
  routerSwap:
    "event Swap(address indexed payer, address indexed receiver, address indexed feeToken, uint256 amountIn, uint256 amountOut, (uint8 swapType, address tokenIn, address tokenOut, address poolAddress, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] descs)",
};

const SWAP_TOPIC_V4 = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const SWAP_TOPIC_PCS = "0x3c48f385280c8ca3102dccfbb0f4a355106f5f55ddcb0cb8f7c26449e0c4f5f3";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FLASH_V4_TICK_SPACING = 200;
const abiCoder = AbiCoder.defaultAbiCoder();

const FALLBACK_POSITION_MANAGERS: Record<string, Record<string, { poolManager: string; dexType: "uniV4" | "pcs" }>> = {
  [CHAIN.BASE]: {
    "0x7c5f5a4bbd8fd63184577525326123b519429bdc": {
      poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
      dexType: "uniV4",
    },
  },
};

const toAddress = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value !== "string") return undefined;
  return value.toLowerCase();
};

const toBigInt = (value: any): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return 0n;
};

const sortAddresses = (tokenA: string, tokenB: string) =>
  BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];

const computeUniV4PoolId = (token: string, baseToken: string | undefined, fee: bigint, tickSpacing: bigint, hooks: string | undefined) => {
  const [token0, token1] = sortAddresses(token, baseToken && baseToken !== ZERO_ADDRESS ? baseToken : ZERO_ADDRESS);
  const hookAddress = hooks && hooks !== ZERO_ADDRESS ? hooks : ZERO_ADDRESS;
  const encoded = abiCoder.encode(
    ["address", "address", "uint24", "int24", "address"],
    [token0, token1, Number(fee), Number(tickSpacing), hookAddress],
  );

  return {
    poolId: keccak256(encoded).toLowerCase(),
    token0,
    token1,
  };
};

const addRouteVolume = (options: FetchOptions, dailyVolume: any, tokenIn: string | undefined, amountIn: bigint, tokenOut: string | undefined, amountOut: bigint) => {
  if (!tokenIn || !tokenOut) return;
  const normalizedAmountIn = amountIn < 0n ? -amountIn : amountIn;
  const normalizedAmountOut = amountOut < 0n ? -amountOut : amountOut;
  if (tokenIn === ZERO_ADDRESS) {
    dailyVolume.addGasToken(normalizedAmountIn);
    return;
  }
  if (tokenOut === ZERO_ADDRESS) {
    dailyVolume.addGasToken(normalizedAmountOut);
    return;
  }
  if (isCoreAsset(options.chain, tokenIn)) {
    dailyVolume.add(tokenIn, normalizedAmountIn);
    return;
  }
  if (isCoreAsset(options.chain, tokenOut)) {
    dailyVolume.add(tokenOut, normalizedAmountOut);
  }
};

const fetch = async (options: FetchOptions) => {
  const core = CORE_CONTRACTS[options.chain];
  const config = chainConfig[options.chain];
  if (!core || !config) throw new Error(`Missing basedbid config for chain ${options.chain}`);
  const discoveryFromBlock = config.fromBlock;

  const dailyVolume = options.createBalances();

  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target: core, eventAbi: ABI.bought }),
    options.getLogs({ target: core, eventAbi: ABI.sold }),
  ]);

  const routerSwapLogs = await Promise.all(
    (ROUTER_CONTRACTS[options.chain] ?? []).map((target) =>
      options.getLogs({ target, eventAbi: ABI.routerSwap }).catch(() => []),
    ),
  );

  routerSwapLogs.flat().forEach((log: any) => {
    const firstRoute = log.descs?.[0] ?? log[5]?.[0];
    const routeHook = toAddress(firstRoute?.hooks ?? firstRoute?.[6]);
    const allowedHooks = FLASH_HOOKS[options.chain];
    if (allowedHooks?.size && (!routeHook || !allowedHooks.has(routeHook))) return;
    addRouteVolume(
      options,
      dailyVolume,
      toAddress(firstRoute?.tokenIn ?? firstRoute?.[1]),
      toBigInt(log.amountIn ?? log[3] ?? 0),
      toAddress(firstRoute?.tokenOut ?? firstRoute?.[2]),
      toBigInt(log.amountOut ?? log[4] ?? 0),
    );
  });

  buyLogs.forEach((log: any) => {
    dailyVolume.addGasToken(log.amountIn ?? log[3] ?? "0");
  });

  sellLogs.forEach((log: any) => {
    const amountOut = toBigInt(log.amountOut ?? log[3] ?? 0);
    const ownerFee = toBigInt(log.amountOwnerFee ?? log[4] ?? 0);
    const subBoardFee = toBigInt(log.amountSubBoardFee ?? log[5] ?? 0);
    const memeOwnerFee = toBigInt(log.amountMemeTokenOwnerFee ?? log[6] ?? 0);
    dailyVolume.addGasToken(amountOut + ownerFee + subBoardFee + memeOwnerFee);
  });

  const [flashV3Created, flashV4Created, finalizedV3, finalizedV4, routerAllowed] = await Promise.all([
    options.getLogs({ target: core, eventAbi: ABI.flashV3Created, fromBlock: discoveryFromBlock, cacheInCloud: true }),
    options.getLogs({ target: core, eventAbi: ABI.flashV4Created, fromBlock: discoveryFromBlock, cacheInCloud: true }).catch(() => []),
    options.getLogs({ target: core, eventAbi: ABI.finalizedV3, fromBlock: discoveryFromBlock, cacheInCloud: true }),
    options.getLogs({ target: core, eventAbi: ABI.finalizedV4, fromBlock: discoveryFromBlock, cacheInCloud: true }),
    options.getLogs({ target: core, eventAbi: ABI.routerAllowed, fromBlock: discoveryFromBlock, cacheInCloud: true }),
  ]);

  const v3Pools = new Set<string>();
  const v4PoolKeys: Array<{ token: string; positionManager: string; baseToken: string | undefined; fee: bigint; tickSpacing: bigint; hooks: string | undefined }> = [];

  flashV3Created.forEach((log: any) => {
    const pool = toAddress(log?.flashLaunchV3Pool?.pool ?? log?.[2]?.pool);
    if (pool) v3Pools.add(pool);
  });
  finalizedV3.forEach((log: any) => {
    const pair = toAddress(log?.pair ?? log?.[5]);
    if (pair) v3Pools.add(pair);
  });

  flashV4Created.forEach((log: any) => {
    const token = toAddress(log?.token ?? log?.[0]);
    const positionManager = toAddress(log?.poolInitialData?.positionManager ?? log?.[1]?.positionManager);
    if (!token || !positionManager) return;
    v4PoolKeys.push({
      token,
      positionManager,
      baseToken: toAddress(log?.poolInitialData?.baseToken ?? log?.[1]?.baseToken) ?? ZERO_ADDRESS,
      fee: toBigInt(log?.poolInitialData?.feeTier ?? log?.[1]?.feeTier ?? 0),
      tickSpacing: BigInt(FLASH_V4_TICK_SPACING),
      hooks: toAddress(log?.flashLaunchV4Pool?.hooks ?? log?.[2]?.hooks),
    });
  });
  finalizedV4.forEach((log: any) => {
    const token = toAddress(log?.memeToken ?? log?.[0]);
    const positionManager = toAddress(log?.positionManager ?? log?.[1]);
    if (!token || !positionManager) return;
    v4PoolKeys.push({
      token,
      positionManager,
      baseToken: ZERO_ADDRESS,
      fee: toBigInt(log?.fee ?? log?.[3] ?? 0),
      tickSpacing: toBigInt(log?.tickSpacing ?? log?.[4] ?? FLASH_V4_TICK_SPACING),
      hooks: toAddress(log?.hooks ?? log?.[5]),
    });
  });

  if (v3Pools.size) {
    const pools = [...v3Pools];
    const [token0s, token1s] = await Promise.all([
      options.api.multiCall({ abi: ABI.token0, calls: pools, permitFailure: true }),
      options.api.multiCall({ abi: ABI.token1, calls: pools, permitFailure: true }),
    ]);

    const tokenMap: Record<string, { token0: string; token1: string }> = {};
    pools.forEach((pool, i) => {
      const token0 = toAddress(token0s[i]);
      const token1 = toAddress(token1s[i]);
      if (token0 && token1) tokenMap[pool] = { token0, token1 };
    });

    await Promise.all(
      pools.map(async (pool) => {
        const poolTokens = tokenMap[pool];
        if (!poolTokens) return;

        const logs = await options.getLogs({ target: pool, eventAbi: ABI.v3Swap });
        logs.forEach((log: any) => {
          addRouteVolume(
            options,
            dailyVolume,
            poolTokens.token0,
            toBigInt(log.amount0 ?? log[2] ?? 0),
            poolTokens.token1,
            toBigInt(log.amount1 ?? log[3] ?? 0),
          );
        });
      }),
    );
  }

  type PoolManagerMeta = { poolManager: string; dexType: "uniV4" | "pcs" };
  const managerByPositionManager: Record<string, PoolManagerMeta> = {};
  Object.assign(managerByPositionManager, FALLBACK_POSITION_MANAGERS[options.chain] ?? {});
  routerAllowed.forEach((log: any) => {
    const positionManager = toAddress(log?.routerOrPositionManager ?? log?.[0]);
    const isAllowed = Number(log?.isAllowed ?? log?.[1] ?? 0);
    const poolManager = toAddress(log?.poolManager ?? log?.[2]);
    if (!positionManager || !poolManager) return;
    if (isAllowed === 4) managerByPositionManager[positionManager] = { poolManager, dexType: "uniV4" };
    if (isAllowed === 14) managerByPositionManager[positionManager] = { poolManager, dexType: "pcs" };
  });

  const poolInfoById: Record<string, { token0: string; token1: string; poolManager: string; dexType: "uniV4" | "pcs" }> = {};

  v4PoolKeys.forEach(({ token, positionManager, baseToken, fee, tickSpacing, hooks }) => {
    const meta = managerByPositionManager[positionManager];
    if (!meta || meta.dexType !== "uniV4") return;
    const poolKey = computeUniV4PoolId(token, baseToken, fee, tickSpacing, hooks);
    poolInfoById[poolKey.poolId] = {
      token0: poolKey.token0,
      token1: poolKey.token1,
      poolManager: meta.poolManager,
      dexType: meta.dexType,
    };
  });
  const v4PoolGroups: Record<string, Set<string>> = {};
  Object.entries(poolInfoById).forEach(([poolId, info]) => {
    const key = `${info.poolManager}:${info.dexType}`;
    if (!v4PoolGroups[key]) v4PoolGroups[key] = new Set();
    v4PoolGroups[key].add(poolId);
  });

  await Promise.all(
    Object.entries(v4PoolGroups).map(async ([groupKey, ids]) => {
      const [poolManager, dexType] = groupKey.split(":");
      const topic0 = dexType === "pcs" ? SWAP_TOPIC_PCS : SWAP_TOPIC_V4;
      const eventAbi = dexType === "pcs" ? ABI.pcsSwap : ABI.v4Swap;

      await Promise.all(
        [...ids].map(async (poolId) => {
          const info = poolInfoById[poolId];
          if (!info) return;
          const logs = await options.getLogs({
            target: poolManager,
            topics: [topic0, poolId],
            eventAbi,
            fromBlock: Number(options.fromApi.block),
            toBlock: Number(options.toApi.block),
          });
          logs.forEach((log: any) => {
            addRouteVolume(
              options,
              dailyVolume,
              info.token0,
              toBigInt(log.amount0 ?? log[2] ?? 0),
              info.token1,
              toBigInt(log.amount1 ?? log[3] ?? 0),
            );
          });
        }),
      );
    }),
  );

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {},
  methodology: {
    Volume:
      "Sum of bonding-curve trade notional (Bought/Sold) plus swap notional across BasedBid FlashLaunch V3/V4 and finalized liquidity pools.",
  },
};

Object.entries(chainConfig).forEach(([chain, config]) => {
  (adapter.adapter as BaseAdapter)[chain] = {
    start: config.start,
    fetch,
  };
});

export default adapter;
