import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ONE_YEAR = 365 * 24 * 60 * 60;

const abis = {
  baseToken: "address:baseToken",
  totalSupply: "uint256:totalSupply",
  getSharePrice: "uint256:getSharePrice",
  // v2 vaults expose the same data under different names, and their fee rates on-chain
  asset: "address:asset",
  effectiveSupply: "uint256:effectiveSupply",
  latestSharePrice: "uint256:latestSharePrice",
  performanceFee: "uint256:performanceFeeBps",
  managementFee: "uint256:maintenanceFeeBps",
};

const FEE_BPS_DIVISOR = 100; // bps -> percent

interface VaultConfig {
  address: string;
  managementFee: number;
  performanceFee: number;
  spikes?: string[];
}

// Fee rates from https://shiftprotocol.gitbook.io/shift
const vaultConfigs: Record<string, VaultConfig[]> = {
  [CHAIN.BASE]: [
    { address: "0xaf69Bf9ea9E0166498c0502aF5B5945980Ed1E0E", managementFee: 0, performanceFee: 5 },     // ltPARA
    { address: "0x4cE3ec1b7B4FFb33A0B70c64a0560A3F341AA2E1", managementFee: 0, performanceFee: 0 },     // extUSD 
  ],
  [CHAIN.ARBITRUM]: [
    { address: "0x956bdd9C18B786b082fd50C52722d254f0CB6964", managementFee: 0, performanceFee: 10 },    // ltLLP
    { address: "0x6d7C897cD8B402690C07e7263C9f59B3777ae3c2", managementFee: 0.5, performanceFee: 10, spikes: ["2026-03-04"] }, // vGRVT
    { address: "0x7174f0bD02664BebDB6Aa79a99fAF949570A10bd", managementFee: 2, performanceFee: 20 },   // hibaUSD
  ],
  [CHAIN.ETHEREUM]: [
    { address: "0xF4761cC51DC4532b064b7E0Bf0883bcA3F84375e", managementFee: 0, performanceFee: 15 },   // shiftEUR (v2 vault)
    { address: "0x5F70E536190C15E5959DbFeF2F2632E540da74CD", managementFee: 0, performanceFee: 10 },   // risexUSDC (v2 vault)
  ],
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const chainVaults = vaultConfigs[options.chain];
  if (!chainVaults) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const vaultAddresses = chainVaults.map((v) => v.address);

  const [baseTokens, assets, totalSupplies, effectiveSupplies, perfFeesOnchain, mgmtFeesOnchain] = await Promise.all([
    options.api.multiCall({ abi: abis.baseToken, calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: abis.asset, calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: abis.totalSupply, calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: abis.effectiveSupply, calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: abis.performanceFee, calls: vaultAddresses, permitFailure: true }),
    options.api.multiCall({ abi: abis.managementFee, calls: vaultAddresses, permitFailure: true }),
  ]);

  const [sharePricesBefore, sharePricesAfter, latestPricesBefore, latestPricesAfter] = await Promise.all([
    options.fromApi.multiCall({ abi: abis.getSharePrice, calls: vaultAddresses, permitFailure: true }),
    options.toApi.multiCall({ abi: abis.getSharePrice, calls: vaultAddresses, permitFailure: true }),
    options.fromApi.multiCall({ abi: abis.latestSharePrice, calls: vaultAddresses, permitFailure: true }),
    options.toApi.multiCall({ abi: abis.latestSharePrice, calls: vaultAddresses, permitFailure: true }),
  ]);

  for (let i = 0; i < chainVaults.length; i++) {
    const vault = chainVaults[i];
    const baseToken = baseTokens[i] ?? assets[i];
    const totalSupply = totalSupplies[i] ?? effectiveSupplies[i];
    const priceBefore = sharePricesBefore[i] ?? latestPricesBefore[i];
    const priceAfter = sharePricesAfter[i] ?? latestPricesAfter[i];

    if (!baseToken || !totalSupply || !priceBefore || !priceAfter || vault.spikes?.includes(options.dateString)) continue;

    // v2 vaults expose their fee rates on-chain, v1 vaults fall back to the hardcoded rates
    const performanceFeePct = perfFeesOnchain[i] != null ? Number(perfFeesOnchain[i]) / FEE_BPS_DIVISOR : vault.performanceFee;
    const managementFeePct = mgmtFeesOnchain[i] != null ? Number(mgmtFeesOnchain[i]) / FEE_BPS_DIVISOR : vault.managementFee;

    if (BigInt(priceBefore) === 0n || BigInt(priceAfter) === 0n) continue;

    const priceChange = BigInt(priceAfter) - BigInt(priceBefore);
    const netYield = BigInt(totalSupply) * priceChange / BigInt(1e18);

    if (performanceFeePct > 0) {
      const perfFee = BigInt(Math.round(performanceFeePct));
      const grossYield = netYield * 100n / (100n - perfFee);
      const perfFeeAmount = grossYield - netYield;

      dailyFees.add(baseToken, grossYield, METRIC.ASSETS_YIELDS);
      dailyRevenue.add(baseToken, perfFeeAmount, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.add(baseToken, netYield, METRIC.ASSETS_YIELDS);
    } else {
      dailyFees.add(baseToken, netYield, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(baseToken, netYield, METRIC.ASSETS_YIELDS);
    }

    if (managementFeePct > 0) {
      const totalAssets = Number(BigInt(totalSupply) * BigInt(priceAfter) / BigInt(1e18));
      const mgmtFee = totalAssets * (managementFeePct / 100) * ((options.toTimestamp - options.fromTimestamp) / ONE_YEAR);

      dailyFees.add(baseToken, mgmtFee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(baseToken, mgmtFee, METRIC.MANAGEMENT_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All yields generated by Shift Protocol vaults from delta-neutral strategies, basis trading, and LP positions, plus performance fees and management fees.",
  Revenue: "Performance fees (5-20%) on vault profits and management fees (0-2% annually) on AUM, all accruing to the protocol treasury.",
  ProtocolRevenue: "All protocol revenue flows to the Shift Protocol treasury.",
  SupplySideRevenue: "Yields distributed to vault depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Gross yields generated by vault strategies including delta-neutral, basis trading, and LP positions.",
    [METRIC.MANAGEMENT_FEES]: "Annual management fees charged on vault AUM (0-2% depending on vault).",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees (5-20%) taken from vault profits, collected by minting shares to treasury.",
    [METRIC.MANAGEMENT_FEES]: "Annual management fees (0-2%) collected from vault assets, all accruing to the protocol treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees (5-20%) taken from vault profits, all accruing to the protocol treasury.",
    [METRIC.MANAGEMENT_FEES]: "Annual management fees (0-2%) collected from vault assets, all accruing to the protocol treasury.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Net yields distributed to vault depositors after performance and management fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: { fetch, start: "2025-09-18" },
    [CHAIN.ARBITRUM]: { fetch, start: "2026-02-20" },
    [CHAIN.ETHEREUM]: { fetch, start: "2026-07-20" },
  },
  pullHourly: true,
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
