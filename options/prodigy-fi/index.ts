import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const WAD = 10n ** 18n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const eventAbis = {
  deposit: "event Deposit(address indexed user,uint256 depositAmount,int256 oraclePriceAtDeposit,uint256 yieldValue)",
  legacyDeposit: "event Deposit(address indexed user,uint256 depositAmount,int256 oraclePriceAtDeposit)",
};

type ChainConfig = {
  startBlock: number;
  // Factory upgrade boundary (topic0 0x1fdc1341...ceed42) where Deposit gained the
  // yieldValue field:
  //   [startBlock, currentDepositStartBlock] -> legacyDeposit (3-arg)
  //   (currentDepositStartBlock, +inf)       -> deposit (4-arg w/ yieldValue)
  currentDepositStartBlock: number;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    startBlock: 23831175,
    currentDepositStartBlock: 23831175, // No legacy deposits on Ethereum; the initial Deposit implementation already emitted yieldValue field
  },
  [CHAIN.BASE]: {
    startBlock: 22133150,
    currentDepositStartBlock: 30509116, // Upgrade to v4 which added yieldValue field in Deposit event
  },
  [CHAIN.BERACHAIN]: {
    startBlock: 804138,
    currentDepositStartBlock: 5297670, // Upgrade to v4 which added yieldValue field in Deposit event
  },
};

type BlockRange = { fromBlock: number; toBlock: number };

type VaultMetadata = {
  investmentToken: string;
  yieldValue: bigint;
};

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

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const chainConfig = config[options.chain];
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const fetchFromBlock = await options.getFromBlock();
  const fetchToBlock = await options.getToBlock();
  const legacyDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.startBlock, chainConfig.currentDepositStartBlock - 1);
  const currentDepositRange = intersectRange(fetchFromBlock, fetchToBlock, chainConfig.currentDepositStartBlock, fetchToBlock);

  // Pull the day's Deposit logs first. The Deposit event's `address` field is
  // the vault contract itself, so we don't need to know the vault list in
  // advance and can skip the expensive factory-wide VaultCreated history.
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

  if (deposits.length === 0) {
    return { dailyNotionalVolume, dailyPremiumVolume };
  }

  const uniqueVaults = [...new Set(deposits.map((d) => d.vault))];
  const needsYieldValueLookup = deposits.some((d) => d.yieldValueFromLog === null);
  const vaultMetadata = await resolveVaultMetadata(options, uniqueVaults, needsYieldValueLookup);

  // Vaults whose metadata could not be resolved are foreign contracts that
  // happened to share the Deposit event signature; skip them rather than
  // poison the totals.
  for (const d of deposits) {
    const metadata = vaultMetadata.get(d.vault);
    if (!metadata) continue;
    const yieldValue = d.yieldValueFromLog ?? metadata.yieldValue;
    const premiumAmount = d.depositAmount * yieldValue / WAD;
    dailyNotionalVolume.add(metadata.investmentToken, d.depositAmount.toString(), "Deposit Notional");
    dailyPremiumVolume.add(metadata.investmentToken, premiumAmount.toString(), "Deposit Premium");
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
  vaultAddresses: string[],
  needsYieldValue: boolean,
): Promise<Map<string, VaultMetadata>> {
  const resolved = new Map<string, VaultMetadata>();

  // Read directly from the vault contract via auto-generated public getters.
  // For legacy 3-arg Deposit vaults `yieldValue` is immutable (no AdjustYieldValue),
  // so reading current state is equivalent to creation-time value.
  //
  // The pair (investmentToken, linkedToken) acts as a Prodigy-vault fingerprint
  // to defend against foreign contracts that coincidentally share the Deposit
  // event signature. Both must be non-zero token addresses and must differ from
  // each other (Prodigy DCI always uses two distinct assets).
  const calls = [
    options.api.multiCall({ abi: "address:investmentToken", calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: "address:linkedToken", calls: vaultAddresses, permitFailure: true }),
  ];
  if (needsYieldValue) {
    calls.push(options.api.multiCall({ abi: "uint256:yieldValue", calls: vaultAddresses, permitFailure: true }));
  }
  const [investmentTokens, linkedTokens, yieldValues] = (await Promise.all(calls)) as [any[], any[], any[] | undefined];

  vaultAddresses.forEach((vault, idx) => {
    const investmentToken = investmentTokens[idx];
    const linkedToken = linkedTokens[idx];
    if (!investmentToken || !linkedToken) return;
    if (investmentToken === ZERO_ADDRESS || linkedToken === ZERO_ADDRESS) return;
    if (investmentToken.toLowerCase() === linkedToken.toLowerCase()) return;

    const yieldValue = yieldValues ? yieldValues[idx] : 0;
    if (needsYieldValue && (yieldValue === null || yieldValue === undefined)) return;

    resolved.set(vault.toLowerCase(), {
      investmentToken,
      yieldValue: toBigInt(needsYieldValue ? yieldValue : 0),
    });
  });

  return resolved;
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
    dailyNotionalVolume: "Deposit Notional: On-chain Deposit principal by investment token.",
    dailyPremiumVolume: "Deposit Premium: On-chain Deposit principal times yieldValue by investment token.",
  },
};

export default adapter;
