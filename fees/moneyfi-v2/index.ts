import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BSC_VAULTS = [
  "0xC45f0c6a22dd5bA2fa75b803bBabc67CC212838c",
  "0xBC96E51AE3A3D0A32091396339a0c2B68DF97e2A",
  "0xf3400439439c911952E9949B6A522Ed78504A253",
];
const BSC_ASSET = "0x55d398326f99059fF775485246999027B3197955"; // Binance-Peg USDT
const PPS_SCALE = 10n ** 18n;

const ABIS = {
  netPricePerShare: "uint256:netPricePerShare",
  totalSupply: "uint256:totalSupply",
  feeRecipient: "address:feeRecipient",
  balanceOf: "function balanceOf(address account) view returns (uint256)",
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [
    ppsBefore,
    ppsAfter,
    supplyAfter,
    feeRecipientsAfter,
    crystallizedBefore,
    crystallizedAfter,
  ] = await Promise.all([
    options.fromApi.multiCall({ abi: ABIS.netPricePerShare, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.netPricePerShare, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.totalSupply, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.feeRecipient, calls: BSC_VAULTS }),
    options.fromApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: BSC_VAULTS }),
    options.toApi.multiCall({ abi: ABIS.totalCrystallizedFeeShares, calls: BSC_VAULTS }),
  ]);

  const feeRecipientBalancesAfter = await options.toApi.multiCall({
    abi: ABIS.balanceOf,
    calls: BSC_VAULTS.map((vault, index) => ({
      target: vault,
      params: [feeRecipientsAfter[index]],
    })),
  });

  for (let i = 0; i < BSC_VAULTS.length; i++) {
    const startPps = BigInt(ppsBefore[i]);
    const endPps = BigInt(ppsAfter[i]);
    const endSupply = BigInt(supplyAfter[i]);
    const protocolOwnedShares = BigInt(feeRecipientBalancesAfter[i]);
    if (protocolOwnedShares > endSupply) {
      throw new Error(`MoneyFi V2 fee-recipient balance exceeds total supply for ${BSC_VAULTS[i]}`);
    }

    // netPricePerShare is already net of accrued management and performance
    // fees. Excluding protocol-owned shares keeps their investment return out
    // of the depositor cost-of-funds metric.
    const depositorShares = endSupply - protocolOwnedShares;
    const depositorYield = depositorShares * (endPps - startPps) / PPS_SCALE;

    const startFees = parseFeeShares(crystallizedBefore[i]);
    const endFees = parseFeeShares(crystallizedAfter[i]);
    if (
      endFees.managementShares < startFees.managementShares
      || endFees.performanceShares < startFees.performanceShares
    ) {
      throw new Error(`MoneyFi V2 cumulative fee shares decreased for ${BSC_VAULTS[i]}`);
    }

    // The Vault exposes monotonic crystallized fee-share counters rather than
    // cumulative fee assets. Value newly minted shares at the period-end PPS,
    // avoiding historical event replay while remaining fully on-chain.
    const managementRevenue =
      (endFees.managementShares - startFees.managementShares) * endPps / PPS_SCALE;
    const performanceRevenue =
      (endFees.performanceShares - startFees.performanceShares) * endPps / PPS_SCALE;
    const protocolRevenue = managementRevenue + performanceRevenue;
    const grossYield = depositorYield + protocolRevenue;

    if (grossYield !== 0n) dailyFees.add(BSC_ASSET, grossYield, METRICS.VAULT_YIELD);
    if (depositorYield !== 0n) {
      dailySupplySideRevenue.add(BSC_ASSET, depositorYield, METRICS.YIELD_TO_DEPOSITORS);
    }
    if (managementRevenue !== 0n) {
      dailyRevenue.add(BSC_ASSET, managementRevenue, METRICS.MANAGEMENT_FEES_TO_PROTOCOL);
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
    Fees: "Gross Vault yield estimated from the period change in net share price plus newly crystallized management and performance fee-share value.",
    Revenue: "Management and performance fee shares crystallized by MoneyFi, valued at the period-end net share price.",
    ProtocolRevenue: "Crystallized management and performance fees allocated to MoneyFi.",
    SupplySideRevenue: "Net share-price return accruing to depositor-owned Vault shares after management and performance fees. Negative values represent negative Vault returns.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.VAULT_YIELD]: "Depositor net yield plus management and performance fee shares crystallized during the period.",
    },
    Revenue: {
      [METRICS.MANAGEMENT_FEES_TO_PROTOCOL]: "New cumulative management fee shares valued at the period-end net share price.",
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "New cumulative performance fee shares valued at the period-end net share price.",
    },
    ProtocolRevenue: {
      [METRICS.MANAGEMENT_FEES_TO_PROTOCOL]: "Crystallized management fees allocated to MoneyFi.",
      [METRICS.PERFORMANCE_FEES_TO_PROTOCOL]: "Crystallized performance fees allocated to MoneyFi.",
    },
    SupplySideRevenue: {
      [METRICS.YIELD_TO_DEPOSITORS]: "Period change in net share price applied to depositor-owned shares at period end.",
    },
  },
  // Negative values reflect negative Vault returns between on-chain snapshots.
  allowNegativeValue: true,
};

export default adapter;
