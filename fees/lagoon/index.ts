import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { InfraConfigs } from "./config";

// docs: https://docs.lagoon.finance/vault/fees
// Lagoon allows curators to deploy vaults - where users can deposit and earn yields
// curators can config and share of yield from performance and management fees
// on top of that, Lagoon can earn up to 30% of those fees as protocol revenue 

const Abis = {
  ProxyDeployedEvent: 'event ProxyDeployed(address proxy, address deployer)',
  convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
  feeRates: 'function feeRates() view returns (uint256 managementRate, uint256 performanceRate)',
  getRolesStorage: 'function getRolesStorage() view returns (address whitelistManager,address feeReceiver,address safe,address feeRegistry,address valuationManager)',
  protocolRate: 'function protocolRate(address vault) view returns (uint256 rate)',
}

const METRICS = {
  ASSETS_YIELDS: METRIC.ASSETS_YIELDS,
  ASSETS_YIELDS_LP: 'Assets Yields To Suppliers',
  PERFORMANCE_FEES: METRIC.PERFORMANCE_FEES,
  MANAGEMENT_FEES: METRIC.MANAGEMENT_FEES,
  CURATORS_FEES: METRIC.CURATORS_FEES,
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  let vaults: Array<string> = InfraConfigs[options.chain].vaults;
  for (const factory of InfraConfigs[options.chain].factories) {
    const events = await options.getLogs({
      eventAbi: Abis.ProxyDeployedEvent,
      target: factory.address,
      cacheInCloud: true,
      fromBlock: factory.fromBlock,
    });
    vaults = vaults.concat(events.map((e: any) => e.proxy))
  }
  if (vaults.length === 0) return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };

  const protocolRates = await options.api.multiCall({
    abi: Abis.protocolRate,
    calls: vaults.map(vault => ({ target: InfraConfigs[options.chain].feeRegistry, params: [vault] })),
    permitFailure: true
  })
  const assets = await options.api.multiCall({ abi: 'address:asset', calls: vaults, permitFailure: true })
  const balances = await options.api.multiCall({ abi: 'uint256:totalAssets', calls: vaults, permitFailure: true })
  const feeRates = await options.api.multiCall({ abi: Abis.feeRates, calls: vaults, permitFailure: true })
  const convertCalls = vaults.map((vault: string) => {
    return {
      target: vault,
      params: [String(1e18)],
    }
  })
  const cumulativeIndexBefore = await options.fromApi.multiCall({ abi: Abis.convertToAssets, calls: convertCalls, permitFailure: true, })
  const cumulativeIndexAfter = await options.toApi.multiCall({ abi: Abis.convertToAssets, calls: convertCalls, permitFailure: true, })

  for (let i = 0; i < vaults.length; i++) {
    if (assets[i] && balances[i] && cumulativeIndexBefore[i] && cumulativeIndexAfter[i]) {
      const cumulativeYield = (BigInt(cumulativeIndexAfter[i]) - BigInt(cumulativeIndexBefore[i])) * BigInt(balances[i]) / BigInt(1e18)
      
      if (cumulativeYield < BigInt(0)) continue;

      const managementFeeRate = Number(feeRates[i] ? Number(feeRates[i].managementRate) / 1e4 : 0)
      const performanceFeeRate = Number(feeRates[i] ? Number(feeRates[i].performanceRate) / 1e4 : 0)
      const protocolFeeRate = Number(protocolRates[i] ? Number(protocolRates[i]) / 1e4 : 0)

      const performanceFees = Number(cumulativeYield) * performanceFeeRate

      const oneYear = 365 * 24 * 3600
      const timeframe = options.toTimestamp - options.fromTimestamp
      const managementFees = Number(balances[i]) * Number(managementFeeRate) * timeframe / oneYear

      const supplySideYields = Number(cumulativeYield) - performanceFees
      const protocolPerformanceFees = Number(performanceFees) * protocolFeeRate
      const protocolManagementFees = Number(managementFees) * protocolFeeRate
      const curatorsFees = (performanceFees * (1- protocolFeeRate)) + (managementFees * (1- protocolFeeRate))

      dailyFees.add(assets[i], supplySideYields, METRICS.ASSETS_YIELDS);
      dailyFees.add(assets[i], protocolPerformanceFees, METRICS.ASSETS_YIELDS);
      dailyFees.add(assets[i], curatorsFees, METRICS.ASSETS_YIELDS);
      dailyFees.add(assets[i], protocolManagementFees, METRICS.MANAGEMENT_FEES);

      dailySupplySideRevenue.add(assets[i], supplySideYields, METRICS.ASSETS_YIELDS_LP);
      dailySupplySideRevenue.add(assets[i], curatorsFees, METRICS.CURATORS_FEES);

      dailyRevenue.add(assets[i], protocolPerformanceFees, METRICS.PERFORMANCE_FEES);
      dailyRevenue.add(assets[i], protocolManagementFees, METRICS.MANAGEMENT_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: InfraConfigs,
  methodology: {
    Fees: 'Total yield to suppliers + fees share to Lagoon protocol + fees share to vault curators.',
    Revenue: 'Portion of performance and management fees to Lagoon protocol.',
    SupplySideRevenue: 'Amount of yields distributed to vault suppliers and curators.',
    ProtocolRevenue: 'Portion of performance and management fees to Lagoon protocol.',
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.ASSETS_YIELDS]: 'Amount of yields after performance and management fees cut.',
      [METRICS.MANAGEMENT_FEES]: 'Management fees share to Lagoon protocol.',
    },
    Revenue: {
      [METRICS.MANAGEMENT_FEES]: 'Management fees share to Lagoon protocol.',
      [METRICS.PERFORMANCE_FEES]: 'Performance fees share to Lagoon protocol.',
    },
    ProtocolRevenue: {
      [METRICS.MANAGEMENT_FEES]: 'Management fees share to Lagoon protocol.',
      [METRICS.PERFORMANCE_FEES]: 'Performance fees share to Lagoon protocol.',
    },
    SupplySideRevenue: {
      [METRICS.ASSETS_YIELDS_LP]: 'Amount of yields after performance and management fees cut to suppliers.',
      [METRICS.CURATORS_FEES]: 'Share of performance and management fees to vault deployers/curators.',
    },
  }
};

export default adapter;
