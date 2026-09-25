import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BSC_ASSET = "0x55d398326f99059fF775485246999027B3197955"; // Binance-Peg USDT
const BSC_VAULTS = [
  {
    // Source: MoneyFi V2 Controller VaultRegistered event on BSC.
    address: "0xf3400439439c911952E9949B6A522Ed78504A253",
    asset: BSC_ASSET,
    start: "2026-08-03",
  },
  // Enable each vault after its first successful settlement:
  // { address: "0xC45f0c6a22dd5bA2fa75b803bBabc67CC212838c", asset: BSC_ASSET, start: "YYYY-MM-DD" },
  // { address: "0xBC96E51AE3A3D0A32091396339a0c2B68DF97e2A", asset: BSC_ASSET, start: "YYYY-MM-DD" },
];
const BSC_START = "2026-08-03";
const PPS_SCALE = 10n ** 18n;
const BPS_SCALE = 10_000n;

const ABIS = {
  netPricePerShare: "uint256:netPricePerShare",
  feeConfig:
    "function feeConfig() view returns (uint16 managementFeeBps, uint16 performanceFeeBps)",
  totalCrystallizedFeeShares:
    "function totalCrystallizedFeeShares() view returns (uint256 managementShares, uint256 performanceShares)",
  feeSettingsUpdated:
    "event FeeSettingsUpdated(address indexed previousRecipient, address indexed newRecipient, uint16 managementFeeBps, uint16 performanceFeeBps)",
  feesUpdated:
    "event FeesUpdated(uint256 managementFeeAssets, uint256 managementFeeShares, uint256 performanceFeeAssets, uint256 performanceFeeShares, uint256 postFeePps)",
};

const FEE_EVENT_INTERFACE = new Interface([ABIS.feeSettingsUpdated, ABIS.feesUpdated]);
const FEE_EVENT_TOPICS = [
  FEE_EVENT_INTERFACE.getEvent("FeeSettingsUpdated")!.topicHash,
  FEE_EVENT_INTERFACE.getEvent("FeesUpdated")!.topicHash,
];

const METRICS = {
  GROSS_PERFORMANCE_YIELD: "Gross Performance Yield",
  YIELD_TO_DEPOSITORS: "Vault Yield To Depositors",
  MANAGEMENT_FEES_TO_PROTOCOL: "Management Fees To Protocol",
  PERFORMANCE_FEES_TO_PROTOCOL: "Performance Fees To Protocol",
};

type FeeShares = {
  managementShares: bigint;
  performanceShares: bigint;
};

type FeeSettingCheckpoint = {
  managementFeeBps: bigint;
  performanceFeeBps: bigint;
  performanceShares: bigint;
};

function parseFeeShares(value: any): FeeShares {
  return {
    managementShares: BigInt(value?.managementShares ?? value?.[0] ?? 0),
    performanceShares: BigInt(value?.performanceShares ?? value?.[1] ?? 0),
  };
}

function parseFeeConfig(value: any) {
  return {
    managementFeeBps: BigInt(value?.managementFeeBps ?? value?.[0] ?? 0),
    performanceFeeBps: BigInt(value?.performanceFeeBps ?? value?.[1] ?? 0),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const vaults = BSC_VAULTS.filter(
    (vault) => options.dateString >= vault.start,
  );
  const vaultAddresses = vaults.map((vault) => vault.address);

  if (vaults.length === 0) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
  }

  const fromBlock = await options.getFromBlock();
  const [ppsAfter, feeConfigsBefore, feeConfigsAfter, crystallizedBefore, crystallizedAfter, rawFeeLogs] = await Promise.all([
    options.toApi.multiCall({ abi: ABIS.netPricePerShare, calls: vaultAddresses }),
    options.fromApi.multiCall({ abi: ABIS.feeConfig, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: ABIS.feeConfig, calls: vaultAddresses }),
    options.fromApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: vaultAddresses }),
    options.getLogs({
      targets: vaultAddresses,
      fromBlock: fromBlock + 1,
      topics: [FEE_EVENT_TOPICS] as any,
      entireLog: true,
      parseLog: false,
      cacheInCloud: true,
      skipIndexer: true,
    }),
  ]);

  const feeEventsByVault = new Map<string, any[]>();
  for (const log of rawFeeLogs) {
    const parsed = FEE_EVENT_INTERFACE.parseLog(log);
    if (!parsed) continue;
    const address = String(log.address).toLowerCase();
    const events = feeEventsByVault.get(address) ?? [];
    events.push({
      blockNumber: Number(log.blockNumber),
      transactionIndex: Number(log.transactionIndex ?? 0),
      logIndex: Number(log.logIndex ?? 0),
      name: parsed.name,
      args: parsed.args,
    });
    feeEventsByVault.set(address, events);
  }

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const endPps = BigInt(ppsAfter[i]);
    const startFeeConfig = parseFeeConfig(feeConfigsBefore[i]);
    const feeConfig = parseFeeConfig(feeConfigsAfter[i]);
    const startFees = parseFeeShares(crystallizedBefore[i]);
    const endFees = parseFeeShares(crystallizedAfter[i]);
    if (
      endFees.managementShares < startFees.managementShares
      || endFees.performanceShares < startFees.performanceShares
    ) {
      throw new Error(`MoneyFi V2 cumulative fee shares decreased for ${vault.address}`);
    }
    const managementShares = endFees.managementShares - startFees.managementShares;
    const performanceShares = endFees.performanceShares - startFees.performanceShares;
    const feeEvents = (feeEventsByVault.get(vault.address.toLowerCase()) ?? [])
      .sort((a, b) => a.blockNumber - b.blockNumber
        || a.transactionIndex - b.transactionIndex
        || a.logIndex - b.logIndex);
    const checkpoints: FeeSettingCheckpoint[] = [];
    let observedPerformanceShares = startFees.performanceShares;
    for (const event of feeEvents) {
      if (event.name === "FeesUpdated") {
        observedPerformanceShares += BigInt(event.args.performanceFeeShares);
      } else if (event.name === "FeeSettingsUpdated") {
        checkpoints.push({
          managementFeeBps: BigInt(event.args.managementFeeBps),
          performanceFeeBps: BigInt(event.args.performanceFeeBps),
          performanceShares: observedPerformanceShares,
        });
      }
    }
    if (checkpoints.length !== 0 && observedPerformanceShares !== endFees.performanceShares) {
      throw new Error(`MoneyFi V2 fee event checkpoint mismatch for ${vault.address}`);
    }

    // Newly crystallized performance-fee shares represent the protocol's fee
    // on realized yield above the Vault high-water mark. Grossing that fee up
    // by the configured rate is flow-independent: deposits and redemptions do
    // not need to be time-weighted.
    const managementRevenue = managementShares * endPps / PPS_SCALE;
    const performanceRevenue = performanceShares * endPps / PPS_SCALE;
    let grossPerformanceYield = 0n;
    let checkpointShares = startFees.performanceShares;
    let checkpointManagementRate = startFeeConfig.managementFeeBps;
    let checkpointRate = startFeeConfig.performanceFeeBps;

    for (const checkpoint of checkpoints) {
      if (
        checkpoint.performanceShares < checkpointShares
        || checkpoint.performanceShares > endFees.performanceShares
      ) {
        throw new Error(`MoneyFi V2 invalid fee-setting checkpoint for ${vault.address}`);
      }
      const segmentShares = checkpoint.performanceShares - checkpointShares;
      if (segmentShares !== 0n) {
        if (checkpointRate === 0n) {
          throw new Error(`MoneyFi V2 performance fee is zero for ${vault.address}`);
        }
        const segmentRevenue = segmentShares * endPps / PPS_SCALE;
        grossPerformanceYield += segmentRevenue * BPS_SCALE / checkpointRate;
      }
      checkpointShares = checkpoint.performanceShares;
      checkpointManagementRate = checkpoint.managementFeeBps;
      checkpointRate = checkpoint.performanceFeeBps;
    }

    if (
      checkpointRate !== feeConfig.performanceFeeBps
      || checkpointManagementRate !== feeConfig.managementFeeBps
    ) {
      throw new Error(`MoneyFi V2 fee-setting checkpoint mismatch for ${vault.address}`);
    }

    const finalSegmentShares = endFees.performanceShares - checkpointShares;
    if (finalSegmentShares !== 0n) {
      if (checkpointRate === 0n) {
        throw new Error(`MoneyFi V2 performance fee is zero for ${vault.address}`);
      }
      const segmentRevenue = finalSegmentShares * endPps / PPS_SCALE;
      grossPerformanceYield += segmentRevenue * BPS_SCALE / checkpointRate;
    }
    const depositorYield = grossPerformanceYield - performanceRevenue;

    if (grossPerformanceYield !== 0n) {
      dailyFees.add(vault.asset, grossPerformanceYield, METRICS.GROSS_PERFORMANCE_YIELD);
    }
    if (managementRevenue !== 0n) {
      dailyFees.add(vault.asset, managementRevenue, METRICS.MANAGEMENT_FEES_TO_PROTOCOL);
    }
    if (depositorYield !== 0n) {
      dailySupplySideRevenue.add(vault.asset, depositorYield, METRICS.YIELD_TO_DEPOSITORS);
    }
    if (performanceRevenue !== 0n) {
      dailyRevenue.add(vault.asset, performanceRevenue, METRICS.PERFORMANCE_FEES_TO_PROTOCOL);
    }
    if (managementRevenue !== 0n) {
      dailyRevenue.add(vault.asset, managementRevenue, METRICS.MANAGEMENT_FEES_TO_PROTOCOL);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Fees crystallize only at discrete Vault lifecycle checkpoints. Hourly
  // sampling would repeat historical BSC state reads between checkpoints
  // without improving the precision of the cumulative on-chain counters.
  pullHourly: false,
  chains: [CHAIN.BSC],
  start: BSC_START,
  fetch,
  methodology: {
    Fees: "Gross realized Vault yield above the high-water mark plus crystallized management fees. Yield is inferred by grossing up newly crystallized performance fees at each Vault's on-chain fee rate.",
    Revenue: "Management and performance fee shares crystallized by MoneyFi, valued at the period-end net share price.",
    ProtocolRevenue: "Crystallized management and performance fees allocated to MoneyFi.",
    SupplySideRevenue: "The remainder of crystallized gross performance yield allocated to Vault depositors after MoneyFi's performance fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.GROSS_PERFORMANCE_YIELD]: "Gross performance yield above the high-water mark, inferred by grossing up crystallized performance fees at the applicable on-chain fee rate.",
      [METRICS.MANAGEMENT_FEES_TO_PROTOCOL]: "New cumulative management fee shares valued at the period-end net share price.",
    },
    Revenue: {
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "New cumulative performance fee shares valued at the period-end net share price.",
      [METRICS.MANAGEMENT_FEES_TO_PROTOCOL]: "New cumulative management fee shares valued at the period-end net share price.",
    },
    ProtocolRevenue: {
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "Crystallized performance fees allocated to MoneyFi.",
      [METRICS.MANAGEMENT_FEES_TO_PROTOCOL]: "Crystallized management fees allocated to MoneyFi.",
    },
    SupplySideRevenue: {
      [METRICS.YIELD_TO_DEPOSITORS]: "Crystallized gross yield remaining for depositors after the performance fee.",
    },
  },
};

export default adapter;
