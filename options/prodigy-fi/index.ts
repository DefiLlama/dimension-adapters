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
  // Factory upgrade boundaries (topic0 0x1fdc1341...ceed42):
  //   [startBlock, legacyVaultCreatedWithParamsStartBlock) -> legacyVaultCreated
  //   [legacyVaultCreatedWithParamsStartBlock, currentVaultCreatedStartBlock) -> legacyVaultCreatedWithParams
  //   [currentVaultCreatedStartBlock, +inf) -> vaultCreated
  legacyVaultCreatedWithParamsStartBlock: number;
  currentVaultCreatedStartBlock: number;
  // Deposit gained the yieldValue field at currentDepositStartBlock:
  //   [startBlock, currentDepositStartBlock) -> legacyDeposit (3-arg)
  //   [currentDepositStartBlock, +inf)       -> deposit (4-arg w/ yieldValue)
  currentDepositStartBlock: number;
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xAC2a612C49f29e26858Df1a53f7623180bcc3753",
    startBlock: 23831175,
    legacyVaultCreatedWithParamsStartBlock: 23831175, // No flat legacy VaultCreated events on Ethereum
    currentVaultCreatedStartBlock: 24036992, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event
    currentDepositStartBlock: 23831175, // No legacy deposits on Ethereum; the initial Deposit implementation already emitted yieldValue field
    start: "2025-11-19"
  },
  [CHAIN.BASE]: {
    factory: "0xFE198B51cfb1F96b56c63fe323a934BEAAA3b281",
    startBlock: 22133150,
    legacyVaultCreatedWithParamsStartBlock: 30509116, // Upgrade to v4 with vaultParams tuple in VaultCreated event
    currentVaultCreatedStartBlock: 39795788, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event
    currentDepositStartBlock: 30509116, // Upgrade to v4 which added yieldValue field in Deposit event
    start: "2024-11-08"
  },
  [CHAIN.BERACHAIN]: {
    factory: "0x29ca87b2f744127606ada4564da8219be6498ca1",
    startBlock: 804138,
    legacyVaultCreatedWithParamsStartBlock: 5297670, // Upgrade to v4 with vaultParams tuple in VaultCreated event
    currentVaultCreatedStartBlock: 14682550, // Upgrade to v8 which added vaultSeriesVersion field in VaultCreated event
    currentDepositStartBlock: 5297670, // Upgrade to v4 which added yieldValue field in Deposit event
    start: "2025-02-07"
  },
};

const vaultMetadataCache = new Map<string, { toBlock: number; metadata: Map<string, VaultMetadata> }>();

type BlockRange = { fromBlock: number; toBlock: number };

type VaultMetadata = {
  investmentToken: string;
  yieldValue: bigint;
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
  if (!vaultAddress || !investmentToken || yieldValue === null || yieldValue === undefined) return;

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
  const legacyDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.startBlock, chainConfig.currentDepositStartBlock - 1);
  const currentDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.currentDepositStartBlock, fetchToBlock);
  const vaultMetadata = await getVaultMetadataFromEvents(options, chainConfig, fetchToBlock);
  const vaultAddresses = [...vaultMetadata.keys()];

  if (vaultAddresses.length === 0) {
    return { dailyNotionalVolume, dailyPremiumVolume };
  }

  let combinedDepositLogs: any[] = [];

  if (currentDepositRange) {
    const currentDepositLogs = await options.getLogs({
      noTarget: true, // there are 40K+ vaults, so no target and filter later is more optimal
      eventAbi: eventAbis.deposit,
      entireLog: true,
      parseLog: true,
    })
    combinedDepositLogs.push(...currentDepositLogs)
  }
  if (legacyDepositRange) {
    const legacyDepositLogs = await options.getLogs({
      noTarget: true, // there are 40K+ vaults, so no target and filter later is more optimal
      eventAbi: eventAbis.legacyDeposit,
      entireLog: true,
      parseLog: true,
    })
    combinedDepositLogs.push(...legacyDepositLogs)
  }

  combinedDepositLogs.forEach(log => {
    const metadata = vaultMetadata.get(log.address.toLowerCase())
    if (!metadata) return;
    const yieldValue = log.args.yieldValue ?? metadata.yieldValue;
    const premiumAmount = BigInt(log.args.depositAmount) * yieldValue / WAD;
    dailyNotionalVolume.add(metadata.investmentToken, log.args.depositAmount);
    dailyPremiumVolume.add(metadata.investmentToken, premiumAmount);
  })

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

async function getVaultMetadataFromEvents(
  options: FetchOptions,
  chainConfig: ChainConfig,
  toBlock: number,
): Promise<Map<string, VaultMetadata>> {
  const cached = vaultMetadataCache.get(options.chain);
  if (cached && cached.toBlock >= toBlock) return cached.metadata;

  const fromBlock = cached ? cached.toBlock + 1 : chainConfig.startBlock;
  const metadata = cached ? new Map(cached.metadata) : new Map<string, VaultMetadata>();
  if (fromBlock > toBlock) return metadata;

  const freshMetadata = await fetchVaultMetadataRange(options, chainConfig, fromBlock, toBlock);
  freshMetadata.forEach((value, vault) => {
    metadata.set(vault, value);
  });

  const latestCached = vaultMetadataCache.get(options.chain);
  if (!latestCached || latestCached.toBlock < toBlock) {
    vaultMetadataCache.set(options.chain, { toBlock, metadata });
    return metadata;
  }

  return latestCached.metadata;
}

async function fetchVaultMetadataRange(
  options: FetchOptions,
  chainConfig: ChainConfig,
  fromBlock: number,
  toBlock: number,
): Promise<Map<string, VaultMetadata>> {
  const vaults = new Map<string, VaultMetadata>();

  const legacyRange = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.startBlock,
    chainConfig.legacyVaultCreatedWithParamsStartBlock - 1,
  );
  const legacyWithParamsRange = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.legacyVaultCreatedWithParamsStartBlock,
    chainConfig.currentVaultCreatedStartBlock - 1,
  );
  const currentRange = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.currentVaultCreatedStartBlock,
    toBlock,
  );

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
        cacheInCloud: true,
      }),
    });
  }

  if (legacyWithParamsRange) {
    queries.push({
      kind: "legacyWithParams",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: eventAbis.legacyVaultCreatedWithParams,
        fromBlock: legacyWithParamsRange.fromBlock,
        toBlock: legacyWithParamsRange.toBlock,
        cacheInCloud: true,
      }),
    });
  }

  if (legacyRange) {
    queries.push({
      kind: "legacy",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: eventAbis.legacyVaultCreated,
        fromBlock: legacyRange.fromBlock,
        toBlock: legacyRange.toBlock,
        cacheInCloud: true,
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
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    NotionalVolume: "Notional volume is the principal deposited into Prodigy.Fi DCI vaults, counted in each vault's investment token when the on-chain Deposit event is emitted.",
    PremiumVolume: "Premium volume is computed from each on-chain Deposit event as deposited principal multiplied by the vault yieldValue, denominated in the same investment token.",
  },
};

export default adapter;
