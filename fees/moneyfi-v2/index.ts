import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BSC_ASSET = "0x55d398326f99059fF775485246999027B3197955"; // Binance-Peg USDT
const BSC_VAULTS = [
  {
    address: "0xf3400439439c911952E9949B6A522Ed78504A253",
    asset: BSC_ASSET,
    start: "2026-08-03",
  },
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
};

const METRICS = {
  VAULT_YIELD: "Vault Yield",
  YIELD_TO_DEPOSITORS: "Vault Yield To Depositors",
  MANAGEMENT_FEES_TO_PROTOCOL: "Management Fees To Protocol",
  PERFORMANCE_FEES_TO_PROTOCOL: "Performance Fees To Protocol",
};

type FeeShares = {
  managementShares: bigint;
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

  const [ppsAfter, feeConfigsBefore, feeConfigsAfter, crystallizedBefore, crystallizedAfter] = await Promise.all([
    options.toApi.multiCall({ abi: ABIS.netPricePerShare, calls: vaultAddresses }),
    options.fromApi.multiCall({ abi: ABIS.feeConfig, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: ABIS.feeConfig, calls: vaultAddresses }),
    options.fromApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: vaultAddresses }),
    options.toApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: vaultAddresses }),
  ]);

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
    if (
      performanceShares !== 0n
      && startFeeConfig.performanceFeeBps !== feeConfig.performanceFeeBps
    ) {
      throw new Error(`MoneyFi V2 performance fee changed during the reporting period for ${vault.address}`);
    }
    if (performanceShares !== 0n && feeConfig.performanceFeeBps === 0n) {
      throw new Error(`MoneyFi V2 performance fee is zero for ${vault.address}`);
    }

    // Newly crystallized performance-fee shares represent the protocol's fee
    // on realized yield above the Vault high-water mark. Grossing that fee up
    // by the configured rate is flow-independent: deposits and redemptions do
    // not need to be time-weighted.
    const managementRevenue = managementShares * endPps / PPS_SCALE;
    const performanceRevenue = performanceShares * endPps / PPS_SCALE;
    const grossPerformanceYield = performanceRevenue === 0n
      ? 0n
      : performanceRevenue * BPS_SCALE / feeConfig.performanceFeeBps;
    const grossYield = grossPerformanceYield + managementRevenue;
    const depositorYield = grossPerformanceYield - performanceRevenue;

    if (grossYield !== 0n) dailyFees.add(vault.asset, grossYield, METRICS.VAULT_YIELD);
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
  // Cumulative snapshots only need one start/end comparison per day. Running
  // hourly would multiply historical BSC eth_call usage without adding source
  // precision.
  pullHourly: false,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: BSC_START,
    },
  },
  methodology: {
    Fees: "Gross realized Vault yield above the high-water mark plus crystallized management fees. Yield is inferred by grossing up newly crystallized performance fees at each Vault's on-chain fee rate.",
    Revenue: "Management and performance fee shares crystallized by MoneyFi, valued at the period-end net share price.",
    ProtocolRevenue: "Crystallized management and performance fees allocated to MoneyFi.",
    SupplySideRevenue: "The remainder of crystallized gross performance yield allocated to Vault depositors after MoneyFi's performance fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.VAULT_YIELD]: "Realized yield above the high-water mark implied by crystallized performance fees, plus crystallized management fees.",
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
