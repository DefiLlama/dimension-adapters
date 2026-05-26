import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const WAD = 10n ** 18n;

const vaultParams = "tuple(address owner,address vaultBatchManager,address linkedToken,address investmentToken,address aggregator,bytes32 priceFeed,uint256 expiry,uint256 linkedPrice,int256 linkedOraclePrice,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256 depositDeadline,uint64 minConfidenceRatio,address collateralPool,uint256 tradingFeeRate,address feeReceiver,int256 oraclePriceAtCreation,address signer)";
const legacyVaultParams = "tuple(address owner,address vaultBatchManager,address linkedToken,address investmentToken,address aggregator,bytes32 priceFeed,uint256 expiry,uint256 linkedPrice,int256 linkedOraclePrice,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256 depositDeadline,uint64 minConfidenceRatio,address collateralPool,uint256 tradingFeeRate,address feeReceiver,int256 oraclePriceAtCreation)";

const eventAbis = {
  vaultCreated: `event VaultCreated(address indexed owner,address indexed baseToken,address indexed quoteToken,address vaultAddress,${vaultParams} vaultParams,uint8 vaultSeriesVersion)`,
  legacyVaultCreatedWithParams: `event VaultCreated(address indexed owner,address indexed baseToken,address indexed quoteToken,address vaultAddress,${legacyVaultParams} vaultParams)`,
  legacyVaultCreated: "event VaultCreated(address indexed owner,address indexed baseToken,address indexed quoteToken,address vaultAddress,uint256 expiry,uint256 linkedPrice,int256 linkedOraclePrice,uint256 yieldValue,bool isBuyLow,uint256 quantity,uint256 depositDeadline,uint256 tradingFeeRate,uint256 cancellationFeeRate,int256 oraclePriceAtCreation)",
  deposit: "event Deposit(address indexed user,uint256 depositAmount,int256 oraclePriceAtDeposit,uint256 yieldValue)",
  legacyDeposit: "event Deposit(address indexed user,uint256 depositAmount,int256 oraclePriceAtDeposit)",
};

type ChainConfig = {
  factory: string;
  startBlock: number;
  // ABI transition cutoffs derived from FactoryUpgraded(uint8 version):
  //   [startBlock, legacyVaultCreatedEndBlock]               -> legacyVaultCreated (flat params)
  //   [legacyVaultCreatedEndBlock, legacyVaultCreatedWithParamsEndBlock] -> legacyVaultCreatedWithParams (tuple)
  //   [legacyVaultCreatedWithParamsEndBlock, toBlock]        -> vaultCreated (tuple + vaultSeriesVersion)
  //   [startBlock, legacyDepositEndBlock]                    -> legacyDeposit (3-arg)
  //   [legacyDepositEndBlock, toBlock]                       -> deposit (4-arg w/ yieldValue)
  legacyVaultCreatedEndBlock: number;
  legacyVaultCreatedWithParamsEndBlock: number;
  legacyDepositEndBlock: number;
};

// Upgrade event topic0: 0x1fdc13413fa0dd2ef7bbf2e469ee3dedb0514e077f73c31c1264893c91ceed42
const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xAC2a612C49f29e26858Df1a53f7623180bcc3753",
    startBlock: 23831175,
    legacyVaultCreatedEndBlock: 0, // No legacy vaults on Ethereum; the initial Factory implementation already emitted VaultCreated with all params as a tuple
    legacyVaultCreatedWithParamsEndBlock: 24036992, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event
    legacyDepositEndBlock: 0, // No legacy deposits on Ethereum; the initial Deposit implementation already emitted yieldValue field
  },
  [CHAIN.BASE]: {
    factory: "0xFE198B51cfb1F96b56c63fe323a934BEAAA3b281",
    startBlock: 22133150,
    legacyVaultCreatedEndBlock: 30509116, // Upgrade to v4 with vaultParams tuple in VaultCreated event
    legacyVaultCreatedWithParamsEndBlock: 39795788, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event
    legacyDepositEndBlock: 30509116, // Upgrade to v4 which added yieldValue field in Deposit event
  },
  [CHAIN.BERACHAIN]: {
    factory: "0x29ca87b2f744127606ada4564da8219be6498ca1",
    startBlock: 804138,
    legacyVaultCreatedEndBlock: 5297670, // Upgrade to v4 with vaultParams tuple in VaultCreated event
    legacyVaultCreatedWithParamsEndBlock: 14682550, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event,
    legacyDepositEndBlock: 5297670, // Upgrade to v4 which added yieldValue field in Deposit event
  },
};

type VaultMetadata = {
  investmentToken: string;
  yieldValue: bigint;
};

type BlockRange = { fromBlock: number; toBlock: number };

type CollectedDeposit = {
  vault: string;
  depositAmount: bigint;
  // null => legacy 3-arg Deposit, yieldValue must be resolved from the vault contract.
  yieldValueFromLog: bigint | null;
};

function intersectRange(
  fromBlock: number,
  toBlock: number,
  rangeStart: number,
  rangeEnd: number,
): BlockRange | null {
  const from = Math.max(fromBlock, rangeStart);
  const to = Math.min(toBlock, rangeEnd);
  if (from > to) return null;
  return { fromBlock: from, toBlock: to };
}

function toBigInt(value: any): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value.toString());
}

function addVaultMetadata(
  vaults: Map<string, VaultMetadata>,
  vaultAddress: string,
  investmentToken: string,
  yieldValue: any,
) {
  vaults.set(vaultAddress.toLowerCase(), {
    investmentToken,
    yieldValue: toBigInt(yieldValue),
  });
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const chainConfig = config[options.chain];
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const fetchFromBlock = await options.getFromBlock();
  const fetchToBlock = await options.getToBlock();
  const legacyDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.startBlock, chainConfig.legacyDepositEndBlock);
  const currentDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.legacyDepositEndBlock, fetchToBlock);

  // 1) Pull only the day's Deposit logs first. The Deposit event's `address` field
  //    is the vault contract itself, so we don't need to know the vault list in
  //    advance. We use noTarget scans + client-side filtering when materialising
  //    vault metadata further down.
  const deposits: CollectedDeposit[] = [];
  const depositTasks: Promise<void>[] = [];

  if (currentDepositRange) {
    depositTasks.push(streamAllDeposits(options, eventAbis.deposit, currentDepositRange, (log) => {
      const args = log.args ?? log;
      deposits.push({
        vault: log.address.toLowerCase(),
        depositAmount: toBigInt(args.depositAmount),
        yieldValueFromLog: toBigInt(args.yieldValue),
      });
    }));
  }
  if (legacyDepositRange) {
    depositTasks.push(streamAllDeposits(options, eventAbis.legacyDeposit, legacyDepositRange, (log) => {
      const args = log.args ?? log;
      deposits.push({
        vault: log.address.toLowerCase(),
        depositAmount: toBigInt(args.depositAmount),
        yieldValueFromLog: null,
      });
    }));
  }
  await Promise.all(depositTasks);

  // No deposits today on this chain -> skip the (expensive) historical VaultCreated scan entirely.
  if (deposits.length === 0) {
    return { dailyNotionalVolume, dailyPremiumVolume };
  }

  // 2) Resolve metadata for only the vaults that actually emitted a Deposit today.
  const uniqueVaults = [...new Set(deposits.map((d) => d.vault))];
  const needsYieldValueLookup = deposits.some((d) => d.yieldValueFromLog === null);
  const vaultMetadata = await resolveVaultMetadata(options, chainConfig, uniqueVaults, needsYieldValueLookup);

  // 3) Aggregate. Vaults whose metadata could not be resolved are foreign contracts
  //    that happened to share the Deposit event signature; skip them rather than
  //    poison the totals.
  for (const d of deposits) {
    const metadata = vaultMetadata.get(d.vault);
    if (!metadata) continue;
    const yieldValue = d.yieldValueFromLog ?? metadata.yieldValue;
    const premiumAmount = d.depositAmount * yieldValue / WAD;
    dailyNotionalVolume.add(metadata.investmentToken, d.depositAmount.toString());
    dailyPremiumVolume.add(metadata.investmentToken, premiumAmount.toString());
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function streamAllDeposits(
  options: FetchOptions,
  eventAbi: string,
  range: BlockRange,
  processor: (log: any) => void,
) {
  try {
    await options.streamLogs({
      noTarget: true,
      eventAbi,
      entireLog: true,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      processor: (logs: any[]) => logs.forEach(processor),
    });
  } catch (e: any) {
    const message = String(e?.message);
    if (!message.includes("streamLogs is not supported") && !message.includes("Llama Indexer URL/api key is not set")) throw e;

    console.log(`streamLogs unavailable on ${options.chain}; falling back to RPC getLogs`);
    const logs = await options.getLogs({
      noTarget: true,
      eventAbi,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      onlyArgs: false,
      skipIndexer: true,
    });
    logs.forEach(processor);
  }
}

async function resolveVaultMetadata(
  options: FetchOptions,
  chainConfig: ChainConfig,
  vaultAddresses: string[],
  needsYieldValue: boolean,
): Promise<Map<string, VaultMetadata>> {
  const resolved = new Map<string, VaultMetadata>();

  // Fast path: read directly from the vault contract via auto-generated public
  // getters. The struct fields `investmentToken` and `yieldValue` are stored as
  // public state, so Solidity exposes them as `investmentToken()` / `yieldValue()`.
  // For legacy 3-arg Deposit vaults `yieldValue` is immutable (no AdjustYieldValue),
  // so reading current state is equivalent to creation-time value.
  const investmentTokens: any[] = await options.api.multiCall({
    abi: "address:investmentToken",
    calls: vaultAddresses,
    permitFailure: true,
  });

  let yieldValues: any[] | null = null;
  if (needsYieldValue) {
    yieldValues = await options.api.multiCall({
      abi: "uint256:yieldValue",
      calls: vaultAddresses,
      permitFailure: true,
    });
  }

  const unresolved: string[] = [];
  vaultAddresses.forEach((vault, idx) => {
    const investmentToken = investmentTokens[idx];
    const yieldValue = yieldValues ? yieldValues[idx] : 0;
    if (!investmentToken || (needsYieldValue && (yieldValue === null || yieldValue === undefined))) {
      unresolved.push(vault);
      return;
    }
    addVaultMetadata(resolved, vault, investmentToken, needsYieldValue ? yieldValue : 0);
  });

  if (unresolved.length === 0) return resolved;

  // Fallback: scan VaultCreated history. This is only reached when on-chain reads
  // failed for at least one vault address (e.g. contract paused / self-destructed
  // / a non-Prodigy contract emitting the same Deposit signature).
  const historical = await getVaultMetadataFromEvents(options, chainConfig);
  for (const vault of unresolved) {
    const meta = historical.get(vault);
    if (meta) resolved.set(vault, meta);
  }

  return resolved;
}

async function getVaultMetadataFromEvents(options: FetchOptions, chainConfig: ChainConfig) {
  const toBlock = await options.getToBlock();
  const vaults = new Map<string, VaultMetadata>();

  // Full historical scope intersected with each event's emission window.
  const legacyV1Range = intersectRange(chainConfig.startBlock, toBlock, chainConfig.startBlock, chainConfig.legacyVaultCreatedEndBlock);
  const legacyV2Range = intersectRange(chainConfig.startBlock, toBlock, chainConfig.legacyVaultCreatedEndBlock, chainConfig.legacyVaultCreatedWithParamsEndBlock);
  const currentRange = intersectRange(chainConfig.startBlock, toBlock, chainConfig.legacyVaultCreatedWithParamsEndBlock, toBlock);

  type VaultQuery =
    | { kind: "current"; logs: Promise<any[]> }
    | { kind: "legacyWithParams"; logs: Promise<any[]> }
    | { kind: "legacy"; logs: Promise<any[]> };

  const queries: VaultQuery[] = [];

  if (currentRange) {
    queries.push({
      kind: "current",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: eventAbis.vaultCreated,
        fromBlock: currentRange.fromBlock,
        toBlock: currentRange.toBlock,
        cacheInCloud: true,
        skipIndexer: true,
      }),
    });
  }

  if (legacyV2Range) {
    queries.push({
      kind: "legacyWithParams",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: eventAbis.legacyVaultCreatedWithParams,
        fromBlock: legacyV2Range.fromBlock,
        toBlock: legacyV2Range.toBlock,
        cacheInCloud: true,
        skipIndexer: true,
      }),
    });
  }

  if (legacyV1Range) {
    queries.push({
      kind: "legacy",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: eventAbis.legacyVaultCreated,
        fromBlock: legacyV1Range.fromBlock,
        toBlock: legacyV1Range.toBlock,
        cacheInCloud: true,
        skipIndexer: true,
      }),
    });
  }

  const resolved = await Promise.all(queries.map((q) => q.logs));

  resolved.forEach((logs, idx) => {
    const kind = queries[idx].kind;
    if (kind === "current" || kind === "legacyWithParams") {
      logs.forEach((log: any) => {
        addVaultMetadata(vaults, log.vaultAddress, log.vaultParams.investmentToken, log.vaultParams.yieldValue);
      });
    } else {
      logs.forEach((log: any) => {
        const investmentToken = log.isBuyLow ? log.quoteToken : log.baseToken;
        addVaultMetadata(vaults, log.vaultAddress, investmentToken, log.yieldValue);
      });
    }
  });

  return vaults;
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    [CHAIN.ETHEREUM, { start: "2025-11-19" }],
    [CHAIN.BASE, { start: "2024-11-08" }],
    [CHAIN.BERACHAIN, { start: "2025-02-07" }],
  ],
  methodology: {
    dailyNotionalVolume: "Notional volume is the principal deposited into Prodigy.Fi DCI vaults, counted in each vault's investment token when the on-chain Deposit event is emitted.",
    dailyPremiumVolume: "Premium volume is computed from each on-chain Deposit event as deposited principal multiplied by the vault yieldValue, denominated in the same investment token.",
  },
  breakdownMethodology: {
    dailyNotionalVolume: "On-chain Deposit principal by investment token.",
    dailyPremiumVolume: "On-chain Deposit principal times yieldValue by investment token.",
  },
};

export default adapter;
