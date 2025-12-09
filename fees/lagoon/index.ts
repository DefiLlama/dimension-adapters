import { METRIC } from "../../helpers/metrics";
import { Adapter, BaseAdapterChainConfig, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { InfraConfigs } from "./config";

// docs: https://docs.lagoon.finance/vault/fees
// Lagoon allows curators to deploy vaults - where users can deposit and earn yields
// curators can config and share of yield from performance and management fees
// on top of that, Lagoon earn 10% from what curators earn

const LAGOON_PROTOCOL_FEES_RATE = 0.1 // 10%

const Abis = {
  ProxyDeployedEvent: 'event ProxyDeployed(address proxy, address deployer)',
  convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
  feeRates: 'function feeRates() view returns (uint256 managementRate, uint256 performanceRate)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  let vaults: Array<string> = InfraConfigs[options.chain].vaults;
  for (const factory of InfraConfigs[options.chain].factories) {
    const events = await options.getLogs({
      eventAbi: Abis.ProxyDeployedEvent,
      target: factory.address,
      fromBlock: factory.fromBlock,
    });
    vaults = vaults.concat(events.map((e: any) => e.proxy))
  }

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
      
      const managementFeeRate = Number(feeRates[i] ? Number(feeRates[i].managementRate) / 1e4 : 0)
      const performanceFeeRate = Number(feeRates[i] ? Number(feeRates[i].performanceRate) / 1e4 : 0)
      
      const performanceFees = Number(cumulativeYield) * performanceFeeRate
      
      const oneYear = 365 * 24 * 3600
      const timeframe = options.toTimestamp - options.fromTimestamp
      const managementFees = Number(balances[i]) * Number(managementFeeRate) * timeframe / oneYear

      const supplySideYields = Number(cumulativeYield) - performanceFees
      
      dailyFees.add(assets[i], supplySideYields, METRIC.ASSETS_YIELDS);
      dailyFees.add(assets[i], performanceFees, METRIC.PERFORMANCE_FEES);
      dailyFees.add(assets[i], managementFees, METRIC.MANAGEMENT_FEES);

      dailySupplySideRevenue.add(assets[i], supplySideYields, METRIC.ASSETS_YIELDS);
      
      dailyRevenue.add(assets[i], performanceFees, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(assets[i], managementFees, METRIC.MANAGEMENT_FEES);

      dailyProtocolRevenue.add(assets[i], Number(performanceFees) * LAGOON_PROTOCOL_FEES_RATE, METRIC.PERFORMANCE_FEES);
      dailyProtocolRevenue.add(assets[i], Number(managementFees) * LAGOON_PROTOCOL_FEES_RATE, METRIC.MANAGEMENT_FEES);
    }
  }
  
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {},
  methodology: {
    Fees: 'Total yield generated from supplied assets.',
    Revenue: 'Amount of performance and management fees to vault deployers and Lagoon protocol.',
    SupplySideRevenue: 'Amount of yields distributed to vault suppliers.',
    ProtocolRevenue: '10% of performance and management fees collected by Lagoon protocol.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: 'Amount of yields after performance and management fees cut.',
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to vault deployers and Lagoon protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Performance fees share to vault deployers and Lagoon protocol.',
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to vault deployers and Lagoon protocol.',
      [METRIC.PERFORMANCE_FEES]: 'Performance fees share to vault deployers and Lagoon protocol.',
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: '10% of management fees share to Lagoon protocol.',
      [METRIC.PERFORMANCE_FEES]: '10% of performance fees share to Lagoon protocol.',
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: 'Amount of yields after performance and management fees cut to suppliers.',
    },
  }
};

for (const [chain, config] of Object.entries(InfraConfigs)) {
  (adapter.adapter as BaseAdapterChainConfig)[chain] = {
    fetch,
    start: config.start,
  }
}

export default adapter;
