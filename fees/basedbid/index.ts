import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { AbiCoder, keccak256 } from "ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PCS_HOOK_PARAMETERS = "0x0000000000000000000000000000000000000000000000000000000000c80cc2";

const chainConfig: Record<string, { TREASURY_CONTRACT: string; CORE_CONTRACT: string; HOOK_CONTRACTS: { target: string; dexType: "uniV4" | "pcs" }[]; start: string; fromBlock: number }> = {
  [CHAIN.ETHEREUM]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x3cb3D9E659653de02D8e3Aecd4963Ba1Ae429682",
    HOOK_CONTRACTS: [{ target: "0x4Cfea8C14d159D96ffB8C1B7B425E0Ddda6B50Cc", dexType: "uniV4" }],
    start: "2025-11-17",
    fromBlock: 23820626,
  },
  [CHAIN.BSC]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x920b4Ee4970CFE1ef523a0679200f9d9b2F87B2c",
    HOOK_CONTRACTS: [
      { target: "0x80DAefeFb1FC0942c7aC6CC65766A9bb085990cc", dexType: "uniV4" },
      { target: "0x106f144922330D6263cd33d71a9B1603bBa0DCCC", dexType: "pcs" },
    ],
    start: "2025-11-17",
    fromBlock: 68536068,
  },
  [CHAIN.BASE]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x0F2C33F406D58144Dec03FCdb69571249F0b0286",
    HOOK_CONTRACTS: [
      { target: "0xea6e57d5FA362C1Fba4F52EE19138a4E79F310CC", dexType: "uniV4" },
      { target: "0xFeA466d80bF94D06c63ccA0C555a8c9A114E60db", dexType: "pcs" },
    ],
    start: "2025-11-17",
    fromBlock: 38305943,
  },
  [CHAIN.MEGAETH]: {
    TREASURY_CONTRACT: "0x64de97c78f9285C6853F75607E83436eF9698c85",
    CORE_CONTRACT: "0x695e175c9704432cdFB98e3C193966F95a5F119D",
    HOOK_CONTRACTS: [{ target: "0xf35301c240fE5a5eDc59ee660eA0893aEe9aD0cc", dexType: "uniV4" },],
    start: "2026-02-09",
    fromBlock: 7852141,
  },
  [CHAIN.ROBINHOOD]: {
    TREASURY_CONTRACT: "0xbD66B5E936877505A63ce61b09A5059012b34fc3",
    CORE_CONTRACT: "0x6EC95a3C6C7b8368C9bF37Ff664672E55df3550d",
    HOOK_CONTRACTS: [{ target: "0x2485F30207230128276DA25ca030c77eA3DDD0cc", dexType: "uniV4" }],
    start: "2026-07-09",
    fromBlock: 4791637,
  },
}

const METRICS = {
  treasuryRevenue: "Treasury Revenue",
  subBoardFees: "SubBoard Fees",
  memeOwnerFees: "Meme Owner Fees",
  referralFees: "Referral Fees",
  hookLiquidityFees: "Hook Liquidity Fees",
  hookBuybackFees: "Hook Buyback Fees",
  hookRewardFees: "Hook Reward Fees",
  hookCustomWalletFees: "Hook Custom Wallet Fees",
};

const ABI = {
  feeCollected: "event FeeCollected(address token, uint256 amount, address from)",
  subBoardFeeCollected: "event SubBoardFeeCollected(address indexed subBoardOwner, address indexed token, uint256 amount)",
  memeOwnerFeeCollected: "event MemeOwnerFeeCollected(address indexed memeOwner, address indexed token, uint256 amount)",
  referralFeeCollected: "event ReferralFeeCollected(address indexed referrer, address indexed token, uint256 amount)",
  liquidityAdded: "event LiquidityAdded(bytes32 indexed poolId, uint256 liquidity0, uint256 liquidity1)",
  buyback: "event Buyback(bytes32 indexed poolId, uint256 projectTokenAmount, uint256 ETHAmount)",
  rewardDistributed: "event RewardDistributed(bytes32 indexed poolId, uint256 amount)",
  customWalletFeeDistributed: "event CustomWalletFeeDistributed(bytes32 indexed poolId, address indexed wallet, uint256 amount)",
  flashV4Created:
    "event FlashLaunchV4TokenCreated(address token, (address positionManager, uint24 feeTier, uint8 decimals, bool isTokenBurn, uint8 _padding1, uint256 virtualEth, uint256 totalSupply, address baseToken, uint8 _padding2, uint256 maxWalletAmount, uint256 maxTxAmount, uint256 protectBlocks, uint160 sqrtPriceX96_1, uint8 _padding3, uint160 sqrtPriceX96_2, uint8 _padding4, int24 tickLower_1, int24 tickUpper_1, int24 tickLower_2, int24 tickUpper_2, uint8 _padding5) poolInitialData, (address owner, bool isTokenBurn, uint8 _padding1, address baseToken, uint8 _padding2, bytes32 subBoard, string metaData, address positionManager, uint8 _padding3, uint256 poolId, address hooks, (bool hasV4Hook, (uint16 liquidityFeeBps, uint16 buybackFeeBps, uint16 rewardFeeBps, address[] customWallets, uint16[] customWalletBps) hookFeeDistributionConfig, uint256 feeThreshold, address rewardToken, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) rewardPoolKey, uint8 feeKind, uint24 staticPoolFeeBpsBuy, uint24 staticPoolFeeBpsSell, uint24 hookFeeBpsBuy, uint24 hookFeeBpsSell, (uint24 minBaseFeeBpsBuy, uint24 minBaseFeeBpsSell, uint24 maxBaseFeeBpsBuy, uint24 maxBaseFeeBpsSell, uint32 baseFeeFactorBuy, uint32 baseFeeFactorSell, uint24 defaultBaseFeeBpsBuy, uint24 defaultBaseFeeBpsSell, uint32 surgeDecayPeriodSeconds, uint32 surgeMultiplierPpm, bool perSwapMode, uint32 capAutoTuneStepPpm, uint32 capAutoTuneIntervalSeconds) dynamicFeeConfig, (uint16[] buyFeesBps, uint16[] sellFeesBps, uint256[] buyFeeTierAmountLevels, uint256[] sellFeeTierAmountLevels) tieredFeeConfig, uint48 protectPeriod, uint256 maxBuyPerOrigin, bool isAntiSandwich, uint32 cooldownSeconds, uint24 penaltyFeeBps, (uint32 volumeIntervalSeconds, uint256[] volumeLevels, uint16[] volumeMultiplierBps) volumeConfig) v4HookData) flashLaunchV4Pool)",
  finalizedV4:
    "event LogMemeTokenLPV4Locked(address memeToken, address positionManager, uint256 poolId, uint24 fee, int24 tickSpacing, address hooks)",
  routerAllowed:
    "event LogRouterOrPositionManagerAllowedChanged(address routerOrPositionManager, uint256 isAllowed, address poolManager)",
  v4PositionManagerUpdated:
    "event V4PositionManagerUpdated(address indexed positionManager, bool isAvailable, address indexed poolManager, address indexed router, uint8 dexType)",
  uniRewardSwapPoolKey:
    "function getRewardSwapPoolKey(bytes32 id) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
  pcsRewardSwapPoolKey:
    "function getRewardSwapPoolKey(bytes32 id) view returns(address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters)",
};

const abiCoder = AbiCoder.defaultAbiCoder();

const toAddress = (value: any): string | undefined => {
  if (!value || typeof value !== "string") return undefined;
  return value.toLowerCase();
};

const toBigInt = (value: any): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(0);
};

const addTokenAmount = (balances: any, token: string | undefined, amount: any, label?: string) => {
  if (!token) return;
  const parsedAmount = toBigInt(amount);
  if (parsedAmount === BigInt(0)) return;
  balances.add(token!, parsedAmount, label);
};

const sortAddresses = (tokenA: string, tokenB: string) =>
  BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];

const computeUniV4PoolId = (token0: string, token1: string, fee: bigint, tickSpacing: bigint, hooks: string) =>
  keccak256(
    abiCoder.encode(
      ["address", "address", "uint24", "int24", "address"],
      [token0, token1, Number(fee), Number(tickSpacing), hooks],
    ),
  ).toLowerCase();

const computePcsPoolId = (token0: string, token1: string, hooks: string, poolManager: string, fee: bigint) =>
  keccak256(
    abiCoder.encode(
      ["address", "address", "address", "address", "uint24", "bytes32"],
      [token0, token1, hooks, poolManager, Number(fee), PCS_HOOK_PARAMETERS],
    ),
  ).toLowerCase();

type HookMeta = {
  hook: string;
  dexType: "uniV4" | "pcs";
  token0: string;
  token1: string;
  projectToken: string;
  nonProjectToken: string;
  rewardToken?: string;
};

type PositionManagerMeta = { poolManager: string; dexType: "uniV4" | "pcs" };

const getHookByAddress = (HOOK_CONTRACTS: { target: string; dexType: "uniV4" | "pcs" }[], hookAddress: string | undefined) =>
  HOOK_CONTRACTS.find((hook) => toAddress(hook.target) === hookAddress);

const fetch = async (options: FetchOptions) => {
  const { TREASURY_CONTRACT, CORE_CONTRACT, HOOK_CONTRACTS, fromBlock } = chainConfig[options.chain];
  const treasury = TREASURY_CONTRACT;
  const core = CORE_CONTRACT;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const revenueLogs = await options.getLogs({ target: treasury, eventAbi: ABI.feeCollected });
  revenueLogs.forEach((log: any) => {
    const token = toAddress(log.token);
    const amount = log.amount;
    addTokenAmount(dailyRevenue, token, amount, METRICS.treasuryRevenue);
    addTokenAmount(dailyProtocolRevenue, token, amount, METRICS.treasuryRevenue);
  });

  const subBoardFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.subBoardFeeCollected });
  const memeOwnerFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.memeOwnerFeeCollected });
  const referralFeeLogs = await options.getLogs({ target: core, eventAbi: ABI.referralFeeCollected });

  subBoardFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.subBoardFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.subBoardFees)
  });
  memeOwnerFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.memeOwnerFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.memeOwnerFees)
  });
  referralFeeLogs.forEach((log: any) =>{
    addTokenAmount(dailyFees, toAddress(log.token), log.amount, METRICS.referralFees),
    addTokenAmount(dailySupplySideRevenue, toAddress(log.token), log.amount, METRICS.referralFees)
  });

  const flashV4CreatedLogs = await options.getLogs({ target: core, eventAbi: ABI.flashV4Created, fromBlock, cacheInCloud: true });
  const finalizedV4Logs = await options.getLogs({ target: core, eventAbi: ABI.finalizedV4, fromBlock, cacheInCloud: true });
  const routerAllowedLogs = await options.getLogs({ target: core, eventAbi: ABI.routerAllowed, fromBlock, cacheInCloud: true });
  const v4PositionManagerUpdatedLogs = await options.getLogs({ target: core, eventAbi: ABI.v4PositionManagerUpdated, fromBlock, cacheInCloud: true });

  const managerByPositionManager: Record<string, PositionManagerMeta> = {};
  routerAllowedLogs.forEach((log: any) => {
    const positionManager = toAddress(log.routerOrPositionManager);
    const isAllowed = Number(log.isAllowed);
    const poolManager = toAddress(log.poolManager);
    if (!positionManager || !poolManager) return;
    if (isAllowed === 4) managerByPositionManager[positionManager] = { poolManager, dexType: "uniV4" };
    if (isAllowed === 14) managerByPositionManager[positionManager] = { poolManager, dexType: "pcs" };
  });
  v4PositionManagerUpdatedLogs.forEach((log: any) => {
    const positionManager = toAddress(log.positionManager);
    const isAvailable = Boolean(log.isAvailable);
    const poolManager = toAddress(log.poolManager);
    const dexTypeValue = Number(log.dexType);
    if (!positionManager || !poolManager || !isAvailable) return;
    managerByPositionManager[positionManager] = { poolManager, dexType: dexTypeValue === 1 ? "pcs" : "uniV4" };
  });

  const hookPoolMeta: Record<string, HookMeta> = {};
  const addHookPoolMeta = ({
    token,
    baseToken,
    fee,
    tickSpacing,
    hooks,
    positionManager,
    rewardToken,
  }: {
    token?: string;
    baseToken?: string;
    fee: bigint;
    tickSpacing: bigint;
    hooks?: string;
    positionManager?: string;
    rewardToken?: string;
  }) => {
    if (!token || !positionManager || !hooks || hooks === ZERO_ADDRESS) return;

    const hookConfig = getHookByAddress(HOOK_CONTRACTS, hooks);
    if (!hookConfig) return;

    const [token0, token1] = sortAddresses(token, baseToken && baseToken !== ZERO_ADDRESS ? baseToken : ZERO_ADDRESS);
    const meta = managerByPositionManager[positionManager];
    const poolManager = meta?.poolManager;
    let poolId: string | undefined;
    if (hookConfig.dexType === "uniV4") poolId = computeUniV4PoolId(token0, token1, fee, tickSpacing, hooks);
    if (hookConfig.dexType === "pcs" && poolManager) poolId = computePcsPoolId(token0, token1, hooks, poolManager, fee);
    if (!poolId) return;

    const projectToken = token;
    hookPoolMeta[poolId] = {
      hook: toAddress(hookConfig.target)!,
      dexType: hookConfig.dexType,
      token0,
      token1,
      projectToken,
      nonProjectToken: token0 === projectToken ? token1 : token0,
      rewardToken,
    };
  };

  flashV4CreatedLogs.forEach((log: any) => {
    const token = toAddress(log.token);
    const positionManager = toAddress(log.poolInitialData?.positionManager);
    const baseToken = toAddress(log.poolInitialData?.baseToken) ?? ZERO_ADDRESS;
    const hooks = toAddress(log.flashLaunchV4Pool?.hooks);
    const rewardToken = toAddress(log.flashLaunchV4Pool?.v4HookData?.rewardToken);
    addHookPoolMeta({
      token,
      positionManager,
      baseToken,
      hooks,
      rewardToken,
      fee: toBigInt(log.poolInitialData?.feeTier ?? 0),
      tickSpacing: BigInt(200),
    });
  });

  finalizedV4Logs.forEach((log: any) => {
    addHookPoolMeta({
      token: toAddress(log.memeToken),
      positionManager: toAddress(log.positionManager),
      baseToken: ZERO_ADDRESS,
      hooks: toAddress(log.hooks),
      fee: toBigInt(log.fee ?? 0),
      tickSpacing: toBigInt(log.tickSpacing ?? 200),
    });
  });

  const hookTargets = (HOOK_CONTRACTS ?? []).map((hook) => hook.target);
  const liquidityAddedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.liquidityAdded, flatten: false });
  const buybackLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.buyback, flatten: false });
  const rewardDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.rewardDistributed, flatten: false });
  const customWalletFeeDistributedLogs = await options.getLogs({ targets: hookTargets, eventAbi: ABI.customWalletFeeDistributed, flatten: false });
  const hookEventLogs = (HOOK_CONTRACTS ?? []).map((hook, i) => ({
    ...hook,
    target: toAddress(hook.target)!,
    liquidityAdded: liquidityAddedLogs[i] ?? [],
    buyback: buybackLogs[i] ?? [],
    rewardDistributed: rewardDistributedLogs[i] ?? [],
    customWalletFeeDistributed: customWalletFeeDistributedLogs[i] ?? [],
  }));

  const rewardPoolCalls = hookEventLogs.flatMap(({ target, dexType, rewardDistributed }) =>
    rewardDistributed.map((log: any) => ({ target, dexType, poolId: String(log.poolId ?? log[0]).toLowerCase() })),
  );
  const rewardPoolKeys: any[] = new Array(rewardPoolCalls.length);
  const pcsIndices: number[] = [];
  const uniIndices: number[] = [];
  rewardPoolCalls.forEach((call, i) => {
    if (call.dexType === "pcs") pcsIndices.push(i);
    else uniIndices.push(i);
  });
  if (pcsIndices.length) {
    const pcsKeys = await options.api.multiCall({
      abi: ABI.pcsRewardSwapPoolKey,
      calls: pcsIndices.map((i) => ({ target: rewardPoolCalls[i].target, params: [rewardPoolCalls[i].poolId] })),
      permitFailure: true,
    });
    pcsKeys.forEach((key, j) => { rewardPoolKeys[pcsIndices[j]] = key; });
  }
  if (uniIndices.length) {
    const uniKeys = await options.api.multiCall({
      abi: ABI.uniRewardSwapPoolKey,
      calls: uniIndices.map((i) => ({ target: rewardPoolCalls[i].target, params: [rewardPoolCalls[i].poolId] })),
      permitFailure: true,
    });
    uniKeys.forEach((key, j) => { rewardPoolKeys[uniIndices[j]] = key; });
  }
  rewardPoolCalls.forEach((call, i) => {
    const poolMeta = hookPoolMeta[call.poolId];
    const rewardPoolKey = rewardPoolKeys[i];
    if (!poolMeta || !rewardPoolKey) return;
    const currency0 = toAddress(rewardPoolKey.currency0);
    const currency1 = toAddress(rewardPoolKey.currency1);
    if (currency0 === ZERO_ADDRESS && currency1 === poolMeta.nonProjectToken) poolMeta.rewardToken = ZERO_ADDRESS;
    if (currency1 === ZERO_ADDRESS && currency0 === poolMeta.nonProjectToken) poolMeta.rewardToken = ZERO_ADDRESS;
    if (currency0 && currency0 !== ZERO_ADDRESS && currency0 !== poolMeta.nonProjectToken) poolMeta.rewardToken = currency0;
    if (currency1 && currency1 !== ZERO_ADDRESS && currency1 !== poolMeta.nonProjectToken) poolMeta.rewardToken = currency1;
  });

  hookEventLogs.forEach(({ liquidityAdded, buyback, rewardDistributed, customWalletFeeDistributed }) => {
    liquidityAdded.forEach((log: any) => {
      const poolMeta = hookPoolMeta[String(log.poolId).toLowerCase()];
      if (!poolMeta) return;
      addTokenAmount(dailyFees, poolMeta.token0, log.liquidity0, METRICS.hookLiquidityFees);
      addTokenAmount(dailyFees, poolMeta.token1, log.liquidity1, METRICS.hookLiquidityFees);
      addTokenAmount(dailySupplySideRevenue, poolMeta.token0, log.liquidity0, METRICS.hookLiquidityFees);
      addTokenAmount(dailySupplySideRevenue, poolMeta.token1, log.liquidity1, METRICS.hookLiquidityFees);
    });
    buyback.forEach((log: any) => {
      const poolMeta = hookPoolMeta[String(log.poolId).toLowerCase()];
      if (!poolMeta) return;
      addTokenAmount(dailyFees, poolMeta.projectToken, log.projectTokenAmount, METRICS.hookBuybackFees);
      addTokenAmount(dailySupplySideRevenue, poolMeta.projectToken, log.projectTokenAmount, METRICS.hookBuybackFees);
    });
    rewardDistributed.forEach((log: any) => {
      const poolMeta = hookPoolMeta[String(log.poolId).toLowerCase()];
      if (!poolMeta) return;
      addTokenAmount(dailyFees, poolMeta.rewardToken, log.amount, METRICS.hookRewardFees);
      addTokenAmount(dailySupplySideRevenue, poolMeta.rewardToken, log.amount, METRICS.hookRewardFees);
    });
    customWalletFeeDistributed.forEach((log: any) => {
      addTokenAmount(dailyFees, ZERO_ADDRESS, log.amount, METRICS.hookCustomWalletFees);
      addTokenAmount(dailySupplySideRevenue, ZERO_ADDRESS, log.amount, METRICS.hookCustomWalletFees);
    });
  });

  dailyFees.add(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees:
      "Fees include treasury revenue, BasedBid core fee-recipient events, and BasedBid V4/PCS hook distribution events priced by token.",
    Revenue: "Revenue is measured only from FeeCollected inflows emitted by the treasury contract.",
    ProtocolRevenue: "Protocol revenue equals treasury FeeCollected inflows.",
    SupplySideRevenue: "Includes all fees collected from liquidity added, buyback, reward distributed, and custom wallet fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.treasuryRevenue]: "Treasury FeeCollected amounts are included in total fees.",
      [METRICS.subBoardFees]: "SubBoardFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.memeOwnerFees]: "MemeOwnerFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.referralFees]: "ReferralFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.hookLiquidityFees]: "LiquidityAdded token0 and token1 amounts emitted by BasedBid hook contracts.",
      [METRICS.hookBuybackFees]: "Buyback projectTokenAmount emitted by BasedBid hook contracts.",
      [METRICS.hookRewardFees]: "RewardDistributed amounts valued in the configured reward token.",
      [METRICS.hookCustomWalletFees]: "CustomWalletFeeDistributed amounts valued as native coin.",
    },
    Revenue: {
      [METRICS.treasuryRevenue]: "Token amounts from treasury FeeCollected events.",
    },
    ProtocolRevenue: {
      [METRICS.treasuryRevenue]: "Token amounts from treasury FeeCollected events.",
    },
    SupplySideRevenue: {
      [METRICS.subBoardFees]: "SubBoardFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.memeOwnerFees]: "MemeOwnerFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.referralFees]: "ReferralFeeCollected amounts emitted by BasedBid core contracts.",
      [METRICS.hookLiquidityFees]: "LiquidityAdded token0 and token1 amounts emitted by BasedBid hook contracts.",
      [METRICS.hookBuybackFees]: "Buyback projectTokenAmount emitted by BasedBid hook contracts.",
      [METRICS.hookRewardFees]: "RewardDistributed amounts valued in the configured reward token.",
      [METRICS.hookCustomWalletFees]: "CustomWalletFeeDistributed amounts valued as native coin.",
    },
  },
};

export default adapter;
