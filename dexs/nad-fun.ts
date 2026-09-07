import { ethers } from "ethers";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type Balances = ReturnType<FetchOptions["createBalances"]>;

const BPS = 10_000n;
const MON = 10n ** 18n;
const V1_FEE_RATE_DENOMINATOR = 1_000_000n;

const v1 = {
  startBlock: 37_709_836,
  bondingCurve: "0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE",
  lpManager: "0xAebe5522749b65eaE7b2A35c593145CC3128b515",
  feeDistributor: "0x1d91A6339f6C484aD9A29dac34d2403E8688A423",
};

// V2 deployment addresses. Keep this block isolated so production address
// updates do not touch the accounting logic below.
const v2 = {
  startBlock: 73_856_000,
  bondingCurve: "0x9f3832732923252A21044F21eE6bd87F09514ae4",
  protocolManager: "0x71F846A560a4d68F53e5bd34ED084E7992f171C7",
  feeCollector: "0xE1C8b73343f5A83EBe165BE90470d84B00e33022",
  // ProtocolManager.initialize() sets the first fee receiver without emitting an
  // event, so the starting value has to be carried here. Every later change does
  // emit FeeReceiverUpdate and is picked up from logs.
  initialFeeReceiver: "0x681C3F796Ae388026634c26025504D7C45248998",
  nadFunFactory: "0xA25b13127e63ddae6d0b35570FF3D39dBD621001",
  // WMON/LVMON are both treated as MON-denominated quote assets.
  monEquivalentQuoteTokens: [
    "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    "0x91b81bfbe3A747230F0529Aa28d8b2Bc898E6D56",
  ],
};

const v1Abi = {
  CurveBuy:
    "event CurveBuy(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  CurveCreate:
    "event CurveCreate(address indexed creator, address indexed token, address indexed pool, string name, string symbol, string tokenURI, uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)",
  CurveGraduate:
    "event CurveGraduate(address indexed token, address indexed pool)",
  CurveSell:
    "event CurveSell(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  LpManagerCollect:
    "event LpManagerCollect(address indexed token, address indexed pool, uint256 monAmount, uint256 tokenAmount, uint256 lastCollectTime)",
  Distributed:
    "event Distributed(address indexed token, uint256 tokenAmount, uint256 monReceived, uint256 foundationAmount, uint256 creatorAmount)",
  SetConfig:
    "event SetConfig(tuple(uint24 communityTreasuryFeeRate, uint24 creatorTreasuryFeeRate, uint24 foundationTreasuryFeeRate) params)",
  config:
    "function config() view returns (uint24 communityTreasuryFeeRate, uint24 creatorTreasuryFeeRate, uint24 foundationTreasuryFeeRate)",
};

const v2Abi = {
  Buy: "event Buy(address indexed token, address indexed buyer, uint256 quoteIn, uint256 tokenOut)",
  Sell: "event Sell(address indexed token, address indexed seller, uint256 tokenIn, uint256 quoteOut)",
  Collect: "event Collect(address indexed token, address indexed pair, uint256 amount)",
  PairCreated:
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount)",
  Swap:
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  Graduate: "event Graduate(address indexed token, address indexed pair)",
  Setup:
    "event Setup(address indexed token, address indexed pair, uint16 creatorFeeRate, uint16 curveProtocolFeeRate, uint16 dexProtocolFeeRate)",
  CurveProtocolFeeRateUpdate:
    "event CurveProtocolFeeRateUpdate(address indexed pair, uint16 oldRate, uint16 newRate)",
  DexProtocolFeeRateUpdate:
    "event DexProtocolFeeRateUpdate(address indexed pair, uint16 oldRate, uint16 newRate)",
  FeeReceiverUpdate: "event FeeReceiverUpdate(address indexed feeReceiver)",
};

interface FeeRates {
  communityRate: bigint;
  creatorRate: bigint;
  foundationRate: bigint;
}

interface FeeRateChange extends FeeRates {
  blockNumber: number;
}

interface MetricsBalances {
  dailyFees: Balances;
  dailyVolume: Balances;
  dailyRevenue: Balances;
  dailySupplySideRevenue: Balances;
}

interface V2PairMeta {
  token0: string;
  token1: string;
  quoteToken?: string;
  creatorFeeRate?: number;
  curveProtocolFeeRate?: number;
  dexProtocolFeeRate?: number;
}

const metrics = {
  CreationFees: "Creation Fees",
  GraduationFees: "Graduation Fees",
  CommunityFees: "Community Fees from LPs",
  CreatorsFees: "Creators Fees from LPs",
  FoundationFees: "Foundation Fees from LPs",
  BuyFees: "Buy Fees",
  SellFees: "Sell Fees",
  V2ProtocolFees: METRIC.PROTOCOL_FEES,
  V2CreatorFees: METRIC.CREATOR_FEES,
  V2LpFees: METRIC.LP_FEES,
};

const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const swapTopic =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const monEquivalentQuoteTokens = new Set(
  v2.monEquivalentQuoteTokens.map((token) => token.toLowerCase()),
);

function parseFeeConfig(config: {
  communityTreasuryFeeRate: string | number | bigint;
  creatorTreasuryFeeRate: string | number | bigint;
  foundationTreasuryFeeRate: string | number | bigint;
}): FeeRates {
  return {
    communityRate: toBigInt(config.communityTreasuryFeeRate),
    creatorRate: toBigInt(config.creatorTreasuryFeeRate),
    foundationRate: toBigInt(config.foundationTreasuryFeeRate),
  };
}

function parseV1SetConfigParams(params: any): FeeRates {
  return parseFeeConfig({
    communityTreasuryFeeRate: params.communityTreasuryFeeRate ?? params[0],
    creatorTreasuryFeeRate: params.creatorTreasuryFeeRate ?? params[1],
    foundationTreasuryFeeRate: params.foundationTreasuryFeeRate ?? params[2],
  });
}

function getV1FeeRatesAtBlock(
  rateHistory: FeeRateChange[],
  blockNumber: number,
  fallbackRates: FeeRates,
): FeeRates {
  let rates = fallbackRates;

  for (const change of rateHistory) {
    if (change.blockNumber > blockNumber) break;
    rates = change;
  }

  return rates;
}

function logArgs<T = any>(log: any): T {
  return (log.args ?? log) as T;
}

function toBigInt(value: string | number | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value.toString());
}

function mulBps(amount: string | number | bigint, bps: number | bigint): bigint {
  return (toBigInt(amount) * BigInt(bps)) / BPS;
}

function addQuoteBalance(
  balances: Balances,
  quoteToken: string | undefined,
  amount: string | number | bigint,
  label?: string,
) {
  const value = toBigInt(amount);
  if (value === 0n || !quoteToken) return;

  if (monEquivalentQuoteTokens.has(quoteToken.toLowerCase())) {
    balances.addGasToken(value, label);
  } else {
    balances.add(quoteToken, value, label);
  }
}

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.filter(Boolean).map((value) => value.toLowerCase())),
  );
}

function toTopicAddress(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

async function getLogsInBlockChunks(
  options: FetchOptions,
  params: Parameters<FetchOptions["getLogs"]>[0],
) {
  return options.getLogs(params);
}

async function addV1Metrics(options: FetchOptions, balances: MetricsBalances) {
  const { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue } =
    balances;

  const [
    startConfigResult,
    creationLogs,
    buyLogs,
    sellLogs,
    graduateLogs,
    lpManagerCollectLogs,
    distributedLogs,
    setConfigLogs,
  ] = await Promise.all([
    options.fromApi.call({ target: v1.lpManager, abi: v1Abi.config }),
    options.getLogs({ target: v1.bondingCurve, eventAbi: v1Abi.CurveCreate }),
    options.getLogs({ target: v1.bondingCurve, eventAbi: v1Abi.CurveBuy }),
    options.getLogs({ target: v1.bondingCurve, eventAbi: v1Abi.CurveSell }),
    options.getLogs({
      target: v1.bondingCurve,
      eventAbi: v1Abi.CurveGraduate,
    }),
    options.getLogs({
      target: v1.lpManager,
      eventAbi: v1Abi.LpManagerCollect,
      onlyArgs: false,
    }),
    options.getLogs({
      target: v1.feeDistributor,
      eventAbi: v1Abi.Distributed,
    }),
    options.getLogs({
      target: v1.lpManager,
      eventAbi: v1Abi.SetConfig,
      onlyArgs: false,
      cacheInCloud: true,
    }),
  ]);

  const periodStartRates = parseFeeConfig(startConfigResult);
  const v1RateHistory = setConfigLogs
    .map((rawLog: any) => {
      const log = logArgs<{ params?: any }>(rawLog);
      const params = log.params ?? (log as any)[0] ?? (rawLog as any)[0] ?? log;
      return {
        blockNumber: Number(rawLog.blockNumber),
        ...parseV1SetConfigParams(params),
      };
    })
    .filter((change: FeeRateChange) => Number.isFinite(change.blockNumber))
    .sort(
      (left: FeeRateChange, right: FeeRateChange) =>
        left.blockNumber - right.blockNumber,
    );

  dailyFees.addGasToken(
    10n * BigInt(creationLogs.length) * MON,
    metrics.CreationFees,
  );
  dailyFees.addGasToken(
    3_000n * BigInt(graduateLogs.length) * MON,
    metrics.GraduationFees,
  );
  dailyRevenue.addGasToken(
    10n * BigInt(creationLogs.length) * MON,
    metrics.CreationFees,
  );
  dailyRevenue.addGasToken(
    3_000n * BigInt(graduateLogs.length) * MON,
    metrics.GraduationFees,
  );

  lpManagerCollectLogs.forEach((rawLog: any) => {
    const log = logArgs<{ monAmount: string | number }>(rawLog);
    const blockNumber = Number(rawLog.blockNumber);
    const { communityRate, creatorRate, foundationRate } =
      Number.isFinite(blockNumber)
        ? getV1FeeRatesAtBlock(v1RateHistory, blockNumber, periodStartRates)
        : periodStartRates;
    const collectFee = toBigInt(log.monAmount);
    const foundationFee =
      (collectFee * foundationRate) / V1_FEE_RATE_DENOMINATOR;
    const communityFee =
      (collectFee * communityRate) / V1_FEE_RATE_DENOMINATOR;
    const creatorFee = (collectFee * creatorRate) / V1_FEE_RATE_DENOMINATOR;

    dailyFees.addGasToken(foundationFee, metrics.FoundationFees);
    dailyFees.addGasToken(communityFee, metrics.CommunityFees);
    dailyFees.addGasToken(creatorFee, metrics.CreatorsFees);

    dailyRevenue.addGasToken(foundationFee, metrics.FoundationFees);

    dailySupplySideRevenue.addGasToken(communityFee, metrics.CommunityFees);
    dailySupplySideRevenue.addGasToken(creatorFee, metrics.CreatorsFees);
  });

  distributedLogs.forEach(
    (log: {
      foundationAmount: string | number;
      creatorAmount: string | number;
    }) => {
      const foundationAmount = toBigInt(log.foundationAmount);
      const creatorAmount = toBigInt(log.creatorAmount);

      dailyFees.addGasToken(foundationAmount, metrics.FoundationFees);
      dailyFees.addGasToken(creatorAmount, metrics.CreatorsFees);

      dailyRevenue.addGasToken(foundationAmount, metrics.FoundationFees);

      dailySupplySideRevenue.addGasToken(creatorAmount, metrics.CreatorsFees);
    },
  );

  buyLogs.forEach((log) => {
    const amountIn = toBigInt(log.amountIn);
    const fee = amountIn / 100n; // 1% fee on buys
    dailyFees.addGasToken(fee, metrics.BuyFees);
    dailyRevenue.addGasToken(fee, metrics.BuyFees);
    dailyVolume.addGasToken(amountIn);
  });

  sellLogs.forEach((log) => {
    const amountOut = toBigInt(log.amountOut);
    const fee = amountOut / 100n; // 1% fee on sells
    dailyFees.addGasToken(fee, metrics.SellFees);
    dailyRevenue.addGasToken(fee, metrics.SellFees);
    dailyVolume.addGasToken(amountOut);
  });
}

// Everything V2 needs is read from event logs rather than an eth_call at the
// period's block. Monad's public RPCs are pruned: a historical call succeeds while
// the block is recent and starts failing once it ages out. The failure was being
// swallowed, so a day recomputed later silently lost its entire V2 leg while still
// looking like a plausible number. Logs do not get pruned, so a day recomputed
// months later now returns what it returned the first time.
async function getV2PairMetadata(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  const allTime = {
    fromBlock: v2.startBlock,
    toBlock,
    onlyArgs: false,
    cacheInCloud: true,
  };

  const [pairLogs, setupLogs, curveRateLogs, dexRateLogs, graduateLogs] =
    await Promise.all([
      options.getLogs({ target: v2.nadFunFactory, eventAbi: v2Abi.PairCreated, ...allTime }),
      options.getLogs({ target: v2.feeCollector, eventAbi: v2Abi.Setup, ...allTime }),
      options.getLogs({ target: v2.feeCollector, eventAbi: v2Abi.CurveProtocolFeeRateUpdate, ...allTime }),
      options.getLogs({ target: v2.feeCollector, eventAbi: v2Abi.DexProtocolFeeRateUpdate, ...allTime }),
      options.getLogs({ target: v2.bondingCurve, eventAbi: v2Abi.Graduate, ...allTime }),
    ]);

  // PairCreated already carries both sides of the pair, so token0/token1 never
  // need to be read back off the pair contract.
  const pairMeta: Record<string, V2PairMeta> = {};
  pairLogs.forEach((rawLog: any) => {
    const log = logArgs<{ token0: string; token1: string; pair: string }>(rawLog);
    const quoteToken = [log.token0, log.token1].find((token) =>
      monEquivalentQuoteTokens.has(token.toLowerCase()),
    );
    pairMeta[log.pair.toLowerCase()] = {
      token0: log.token0,
      token1: log.token1,
      quoteToken,
    };
  });

  // Setup carries the rates a pair is configured with; the two update events carry
  // every change after that. Replaying them in block order leaves each pair holding
  // the rates getFeeConfig() would have returned at toBlock.
  const rateEvents: {
    blockNumber: number;
    logIndex: number;
    pair: string;
    patch: Partial<V2PairMeta>;
  }[] = [];
  const tokenQuoteMap: Record<string, string> = {};

  setupLogs.forEach((rawLog: any) => {
    const log = logArgs<{
      token: string;
      pair: string;
      creatorFeeRate: string | number;
      curveProtocolFeeRate: string | number;
      dexProtocolFeeRate: string | number;
    }>(rawLog);
    const pair = log.pair.toLowerCase();
    rateEvents.push({
      blockNumber: Number(rawLog.blockNumber),
      logIndex: Number(rawLog.logIndex ?? 0),
      pair,
      patch: {
        creatorFeeRate: Number(log.creatorFeeRate),
        curveProtocolFeeRate: Number(log.curveProtocolFeeRate),
        dexProtocolFeeRate: Number(log.dexProtocolFeeRate),
      },
    });
    // Setup is also the token -> pair link, which is what the curve trade volume
    // needs to know which quote asset a token trades against.
    const quoteToken = pairMeta[pair]?.quoteToken;
    if (quoteToken) tokenQuoteMap[log.token.toLowerCase()] = quoteToken;
  });

  const pushRateUpdate = (rawLog: any, key: keyof V2PairMeta) => {
    const log = logArgs<{ pair: string; newRate: string | number }>(rawLog);
    rateEvents.push({
      blockNumber: Number(rawLog.blockNumber),
      logIndex: Number(rawLog.logIndex ?? 0),
      pair: log.pair.toLowerCase(),
      patch: { [key]: Number(log.newRate) } as Partial<V2PairMeta>,
    });
  };
  curveRateLogs.forEach((rawLog: any) => pushRateUpdate(rawLog, "curveProtocolFeeRate"));
  dexRateLogs.forEach((rawLog: any) => pushRateUpdate(rawLog, "dexProtocolFeeRate"));

  rateEvents
    .sort((left, right) =>
      left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
    )
    .forEach((event) => {
      const meta = pairMeta[event.pair];
      if (meta) Object.assign(meta, event.patch);
    });

  // Only a graduated pair holds liquidity, so it is the only kind that can emit a
  // Swap. This is the swap-log target list, and it replaces the previous $200
  // filterPools pass: that needed a balanceOf multiCall across every pair, which is
  // the same pruned-state call this function exists to avoid, and it also dropped
  // pools that are live but thin.
  const pairs = unique(
    graduateLogs
      .map((rawLog: any) => logArgs<{ pair: string }>(rawLog).pair.toLowerCase())
      .filter((pair: string) => Boolean(pairMeta[pair])),
  );

  return { pairs, pairMeta, tokenQuoteMap };
}

async function getV2FeeReceiver(options: FetchOptions) {
  const logs = await options.getLogs({
    target: v2.protocolManager,
    eventAbi: v2Abi.FeeReceiverUpdate,
    fromBlock: v2.startBlock,
    toBlock: await options.getToBlock(),
    onlyArgs: false,
    cacheInCloud: true,
  });

  if (!logs.length) return v2.initialFeeReceiver;

  const latest = logs.reduce((acc: any, log: any) => {
    const newer =
      Number(log.blockNumber) - Number(acc.blockNumber) ||
      Number(log.logIndex ?? 0) - Number(acc.logIndex ?? 0);
    return newer > 0 ? log : acc;
  });
  return logArgs<{ feeReceiver: string }>(latest).feeReceiver;
}

async function addV2ProtocolTransfers(
  options: FetchOptions,
  quoteTokens: string[],
  source: string,
  feeReceiver: string,
  revenueBalances: Balances,
  feeBalances?: Balances,
) {
  if (!quoteTokens.length) return;

  const quoteTokenSet = new Set(quoteTokens.map((token) => token.toLowerCase()));
  const logs = await getLogsInBlockChunks(options, {
    targets: quoteTokens,
    eventAbi: v2Abi.Transfer,
    topics: [
      transferTopic,
      toTopicAddress(source),
      toTopicAddress(feeReceiver),
    ],
    entireLog: true,
    parseLog: true,
  });

  logs.forEach((rawLog) => {
    const quoteToken = (rawLog.address ?? rawLog.source)?.toLowerCase();
    if (!quoteTokenSet.has(quoteToken)) return;
    const log = logArgs<{ value: string | number | bigint }>(rawLog);
    addQuoteBalance(
      revenueBalances,
      quoteToken,
      log.value,
      metrics.V2ProtocolFees,
    );
    if (feeBalances) {
      addQuoteBalance(
        feeBalances,
        quoteToken,
        log.value,
        metrics.V2ProtocolFees,
      );
    }
  });
}

async function addV2Metrics(options: FetchOptions, balances: MetricsBalances) {
  const { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue } =
    balances;

  if ((await options.getEndBlock()) < v2.startBlock) return;

  const feeReceiver = await getV2FeeReceiver(options);

  const [curveBuyLogs, curveSellLogs, collectLogs, { pairs, pairMeta, tokenQuoteMap }] =
    await Promise.all([
      getLogsInBlockChunks(options, {
        target: v2.bondingCurve,
        eventAbi: v2Abi.Buy,
        onlyArgs: false,
      }),
      getLogsInBlockChunks(options, {
        target: v2.bondingCurve,
        eventAbi: v2Abi.Sell,
        onlyArgs: false,
      }),
      getLogsInBlockChunks(options, {
        target: v2.feeCollector,
        eventAbi: v2Abi.Collect,
        onlyArgs: false,
      }),
      getV2PairMetadata(options),
    ]);

  const quoteTokens = unique([
    ...v2.monEquivalentQuoteTokens,
    ...Object.values(tokenQuoteMap),
    ...Object.values(pairMeta)
      .map((meta) => meta.quoteToken)
      .filter((token): token is string => Boolean(token)),
  ]);

  const curveTradeTxs = new Set<string>();

  curveBuyLogs.forEach((rawLog: any) => {
    const log = logArgs<{ token: string; quoteIn: string | number | bigint }>(
      rawLog,
    );
    if (rawLog.transactionHash) curveTradeTxs.add(rawLog.transactionHash);
    addQuoteBalance(
      dailyVolume,
      tokenQuoteMap[log.token.toLowerCase()],
      log.quoteIn,
    );
  });

  curveSellLogs.forEach((rawLog: any) => {
    const log = logArgs<{ token: string; quoteOut: string | number | bigint }>(
      rawLog,
    );
    if (rawLog.transactionHash) curveTradeTxs.add(rawLog.transactionHash);
    addQuoteBalance(
      dailyVolume,
      tokenQuoteMap[log.token.toLowerCase()],
      log.quoteOut,
    );
  });

  collectLogs.forEach((rawLog: any) => {
    const log = logArgs<{
      pair: string;
      amount: string | number | bigint;
    }>(rawLog);
    const meta = pairMeta[log.pair.toLowerCase()];
    const amount = toBigInt(log.amount);
    const creatorRate = meta?.creatorFeeRate ?? 0;
    const protocolRate = curveTradeTxs.has(rawLog.transactionHash)
      ? meta?.curveProtocolFeeRate ?? 0
      : meta?.dexProtocolFeeRate ?? 0;
    const totalRate = creatorRate + protocolRate;

    if (totalRate === 0) {
      return;
    }

    const creatorFee = (amount * BigInt(creatorRate)) / BigInt(totalRate);
    const protocolFee = amount - creatorFee;

    addQuoteBalance(
      dailyFees,
      meta?.quoteToken,
      protocolFee,
      metrics.V2ProtocolFees,
    );
    addQuoteBalance(
      dailyFees,
      meta?.quoteToken,
      creatorFee,
      metrics.V2CreatorFees,
    );
    addQuoteBalance(
      dailySupplySideRevenue,
      meta?.quoteToken,
      creatorFee,
      metrics.V2CreatorFees,
    );
  });

  if (pairs.length > 0) {
    const pairSet = new Set(pairs);
    const swapLogs = await getLogsInBlockChunks(
      options,
      {
        targets: [...pairSet],
        eventAbi: v2Abi.Swap,
        topics: [swapTopic],
        entireLog: true,
        parseLog: true,
      },
    );

    swapLogs.forEach((rawLog) => {
      const pair = (rawLog.address ?? rawLog.source)?.toLowerCase();
      if (!pairSet.has(pair)) return;
      const meta = pairMeta[pair];
      if (!meta?.quoteToken || !meta.token0 || !meta.token1) {
        throw new Error(
          `Missing metadata for NadFunPair ${pair}: ${JSON.stringify(meta ?? null)}`,
        );
      }

      const quoteIsToken0 =
        meta.quoteToken!.toLowerCase() === meta.token0.toLowerCase();
      const log = logArgs<{
        amount0In: string | number | bigint;
        amount1In: string | number | bigint;
        amount0Out: string | number | bigint;
        amount1Out: string | number | bigint;
      }>(rawLog);

      const quoteIn = quoteIsToken0
        ? toBigInt(log.amount0In)
        : toBigInt(log.amount1In);
      const quoteOut = quoteIsToken0
        ? toBigInt(log.amount0Out)
        : toBigInt(log.amount1Out);
      const quoteVolume = quoteIn + quoteOut;
      const lpFee = mulBps(quoteVolume, 25n); // NadFunPair LP_FEE_RATE = 0.25%
      const protocolLpFee = lpFee / 5n; // _mintFee captures 1/5 of LP fees
      const supplySideLpFee = lpFee - protocolLpFee;

      addQuoteBalance(dailyVolume, meta.quoteToken, quoteVolume);
      addQuoteBalance(dailyFees, meta.quoteToken, lpFee, metrics.V2LpFees);
      addQuoteBalance(
        dailyRevenue,
        meta.quoteToken,
        protocolLpFee,
        metrics.V2ProtocolFees,
      );
      addQuoteBalance(
        dailySupplySideRevenue,
        meta.quoteToken,
        supplySideLpFee,
        metrics.V2LpFees,
      );
    });
  }

  // FeeCollector -> feeReceiver transfers are the exact protocol revenue portion
  // of creator/protocol trade fees already counted above in dailyFees.
  await addV2ProtocolTransfers(
    options,
    quoteTokens,
    v2.feeCollector,
    feeReceiver,
    dailyRevenue,
  );

  // BondingCurve -> feeReceiver transfers are direct protocol fees such as
  // deploy, graduation, sniping, and protocol-only curve fees. These are both
  // user fees and protocol revenue.
  await addV2ProtocolTransfers(
    options,
    quoteTokens,
    v2.bondingCurve,
    feeReceiver,
    dailyRevenue,
    dailyFees,
  );
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const balances = {
    dailyFees,
    dailyVolume,
    dailyRevenue,
    dailySupplySideRevenue,
  };

  await addV1Metrics(options, balances);
  await addV2Metrics(options, balances);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees:
      "V1 fees are counted from the legacy bonding curve, LP manager, and fee distributor events. Legacy LP manager splits use the initial fee split and subsequent SetConfig event history. V2 fees include protocol fees, creator fees, and NadFunPair LP swap fees. Creator fees are included in total fees but excluded from protocol revenue.",
    Revenue:
      "V1 protocol revenue follows the legacy fee accounting. V2 protocol revenue includes actual quote-token transfers to the protocol fee receiver plus the protocol share of NadFunPair LP fees. Creator fees are not counted as protocol revenue.",
    ProtocolRevenue:
      "Protocol revenue is the protocol-controlled share of fees, excluding creator/vault fees.",
    SupplySideRevenue:
      "Supply-side revenue includes creator/vault fees and LP fees retained by liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.CreationFees]:
        "V1 10 MON fee charged when a new token is created on the bonding curve.",
      [metrics.GraduationFees]:
        "V1 flat 3,000 MON fee charged when a token graduates from the bonding curve to the DEX pool.",
      [metrics.BuyFees]:
        "V1 1% fee charged on the MON input amount for bonding curve buy trades.",
      [metrics.SellFees]:
        "V1 1% fee charged on the MON output amount for bonding curve sell trades.",
      [metrics.FoundationFees]:
        "V1 foundation share of fees collected by the legacy LP manager or fee distributor. LP manager rates follow SetConfig event history.",
      [metrics.CommunityFees]:
        "V1 community share of fees collected by the legacy LP manager. LP manager rates follow SetConfig event history.",
      [metrics.CreatorsFees]:
        "V1 creator share of fees collected by the legacy LP manager or fee distributor. LP manager rates follow SetConfig event history.",
      [metrics.V2ProtocolFees]:
        "V2 protocol fees from bonding curve operations and protocol fee shares from V2 trades.",
      [metrics.V2CreatorFees]:
        "V2 creator fees accrued from bonding curve and DEX trades.",
      [metrics.V2LpFees]:
        "V2 0.25% NadFunPair LP swap fee.",
    },
    Revenue: {
      [metrics.CreationFees]:
        "V1 10 MON fee charged when a new token is created on the bonding curve.",
      [metrics.GraduationFees]:
        "V1 flat 3,000 MON fee charged when a token graduates from the bonding curve to the DEX pool.",
      [metrics.BuyFees]:
        "V1 1% fee charged on the MON input amount for bonding curve buy trades.",
      [metrics.SellFees]:
        "V1 1% fee charged on the MON output amount for bonding curve sell trades.",
      [metrics.FoundationFees]:
        "V1 foundation share of fees collected by the legacy LP manager or fee distributor. LP manager rates follow SetConfig event history.",
      [metrics.V2ProtocolFees]:
        "V2 protocol-controlled fee revenue. Creator fees are excluded.",
    },
    SupplySideRevenue: {
      [metrics.CommunityFees]:
        "V1 community share of fees collected by the legacy LP manager. LP manager rates follow SetConfig event history.",
      [metrics.CreatorsFees]:
        "V1 creator share of fees collected by the legacy LP manager or fee distributor. LP manager rates follow SetConfig event history.",
      [metrics.V2CreatorFees]: "V2 creator/vault fee share.",
      [metrics.V2LpFees]: "V2 LP fee share retained by liquidity providers.",
    },
  },
};

export default adapter;
