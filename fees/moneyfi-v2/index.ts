import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BSC_VAULTS = [
  "0xC45f0c6a22dd5bA2fa75b803bBabc67CC212838c",
  "0xBC96E51AE3A3D0A32091396339a0c2B68DF97e2A",
  "0xf3400439439c911952E9949B6A522Ed78504A253",
];
const BSC_ASSET = "0x55d398326f99059fF775485246999027B3197955"; // Binance-Peg USDT
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

  const [ppsAfter, feeConfigsBefore, feeConfigsAfter, crystallizedBefore, crystallizedAfter] = await Promise.all([
    options.toApi.multiCall({ abi: ABIS.netPricePerShare, calls: BSC_VAULTS }),
    options.fromApi.multiCall({ abi: ABIS.feeConfig, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.feeConfig, calls: BSC_VAULTS }),
    options.fromApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: BSC_VAULTS }),
  ]);

  for (let i = 0; i < BSC_VAULTS.length; i++) {
    const endPps = BigInt(ppsAfter[i]);
    const startFeeConfig = parseFeeConfig(feeConfigsBefore[i]);
    const feeConfig = parseFeeConfig(feeConfigsAfter[i]);
    const startFees = parseFeeShares(crystallizedBefore[i]);
    const endFees = parseFeeShares(crystallizedAfter[i]);
    if (
      endFees.managementShares < startFees.managementShares
      || endFees.performanceShares < startFees.performanceShares
    ) {
      throw new Error(`MoneyFi V2 cumulative fee shares decreased for ${BSC_VAULTS[i]}`);
    }
    if (
      startFeeConfig.managementFeeBps !== feeConfig.managementFeeBps
      || startFeeConfig.performanceFeeBps !== feeConfig.performanceFeeBps
    ) {
      throw new Error(`MoneyFi V2 fee config changed during the reporting period for ${BSC_VAULTS[i]}`);
    }
    if (feeConfig.managementFeeBps !== 0n) {
      throw new Error(`MoneyFi V2 gross-yield inference does not support management fees for ${BSC_VAULTS[i]}`);
    }
    if (feeConfig.performanceFeeBps === 0n) {
      throw new Error(`MoneyFi V2 performance fee is zero for ${BSC_VAULTS[i]}`);
    }

    const managementShares = endFees.managementShares - startFees.managementShares;
    if (managementShares !== 0n) {
      throw new Error(`MoneyFi V2 crystallized management fee shares for ${BSC_VAULTS[i]}`);
    }

    // Newly crystallized performance-fee shares represent the protocol's fee
    // on realized yield above the Vault high-water mark. Grossing that fee up
    // by the configured rate is flow-independent: deposits and redemptions do
    // not need to be time-weighted.
    const performanceRevenue =
      (endFees.performanceShares - startFees.performanceShares) * endPps / PPS_SCALE;
    const grossYield = performanceRevenue * BPS_SCALE / feeConfig.performanceFeeBps;
    const depositorYield = grossYield - performanceRevenue;

    if (grossYield !== 0n) dailyFees.add(BSC_ASSET, grossYield, METRICS.VAULT_YIELD);
    if (depositorYield !== 0n) {
      dailySupplySideRevenue.add(BSC_ASSET, depositorYield, METRICS.YIELD_TO_DEPOSITORS);
    }
    if (performanceRevenue !== 0n) {
      dailyRevenue.add(BSC_ASSET, performanceRevenue, METRICS.PERFORMANCE_FEES_TO_PROTOCOL);
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
      start: "2026-09-21",
    },
  },
  methodology: {
    Fees: "Gross realized Vault yield above the high-water mark, inferred by grossing up newly crystallized performance fees at each Vault's on-chain fee rate.",
    Revenue: "Performance fee shares crystallized by MoneyFi, valued at the period-end net share price.",
    ProtocolRevenue: "Crystallized performance fees allocated to MoneyFi.",
    SupplySideRevenue: "The remainder of crystallized gross yield allocated to Vault depositors after MoneyFi's performance fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.VAULT_YIELD]: "Realized yield above the high-water mark implied by the crystallized performance fee and configured fee rate.",
    },
    Revenue: {
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "New cumulative performance fee shares valued at the period-end net share price.",
    },
    ProtocolRevenue: {
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "Crystallized performance fees allocated to MoneyFi.",
    },
    SupplySideRevenue: {
      [METRICS.YIELD_TO_DEPOSITORS]: "Crystallized gross yield remaining for depositors after the performance fee.",
    },
  },
};

export default adapter;
