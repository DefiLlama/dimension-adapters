import { METRIC } from "../../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { getERC4626VaultsYield } from "../../helpers/erc4626";

const UPSHIFT_API = 'https://api.upshift.finance/v1/tokenized_vaults';
const CHAIN_ID_MAP: any = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.BSC]: 56,
  [CHAIN.MONAD]: 143,
}
const ONE_YEAR = 365 * 24 * 60 * 60;

async function prefetch(_a: any): Promise<any> {
  return await getConfig('upshift-vaults', UPSHIFT_API);
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const vaultsData = options.preFetchedResults;
  if (!vaultsData)
    throw new Error("No upshift vaults data")

  const currentChainVaults = vaultsData.filter((vault: any) => vault.chain === CHAIN_ID_MAP[options.chain]);

  await Promise.allSettled(currentChainVaults.map(async (vault: any) => {
    const { address, weekly_performance_fee_bps, platform_fee_override } = vault;
    const management_fee = platform_fee_override?.management_fee ?? 0;
    const dailyYield = await getERC4626VaultsYield({ options, vaults: [address] });
    const totalAssets = await options.api.call({
      target: address,
      abi: 'uint256:totalAssets',
      permitFailure: true,
    })
    const asset = await options.api.call({
      target: address,
      abi: 'address:asset',
      permitFailure: true,
    })

    if (+Object.values(dailyYield._balances)[0] > 0) {
      dailySupplySideRevenue.add(dailyYield, 'Assets Yields To Suppliers');
      dailyFees.add(dailyYield.clone(1 / (1 - weekly_performance_fee_bps / 100)), METRIC.ASSETS_YIELDS);
      dailyRevenue.add(dailyYield.clone(1 / (1 - weekly_performance_fee_bps / 100) - 1), METRIC.PERFORMANCE_FEES);
    }

    if (totalAssets && asset) {
      const dailyManagementFee = totalAssets * (management_fee / 100) * ((options.toTimestamp - options.fromTimestamp) / ONE_YEAR)
      dailyFees.add(asset, dailyManagementFee, METRIC.MANAGEMENT_FEES);
      dailyRevenue.add(asset, dailyManagementFee, METRIC.MANAGEMENT_FEES);
    }
  }))

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'All yields generated from deposited assets in all vaults.',
  Revenue: 'Performance fees and management fees paid from user yields.',
  ProtocolRevenue: 'Performance fees and management fees paid from user yields.',
  SupplySideRevenue: 'Yields are distributed to vaults suppliers post fees.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Yields generated from deposited assets in all vaults.',
    [METRIC.PERFORMANCE_FEES]: 'Performance fees paid by vault users.',
    [METRIC.MANAGEMENT_FEES]: 'Management fees paid by vault users.',
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: 'Performance fees paid by vault users.',
    [METRIC.MANAGEMENT_FEES]: 'Management fees paid by vault users.',
  },
  SupplySideRevenue: {
    'Assets Yields To Suppliers': 'Yields generated are distributed to vaults suppliers post fees.',
  },
}

const adapter: Adapter = {
  version: 2,
  prefetch,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-09-15' },
    [CHAIN.AVAX]: { start: '2024-11-04' },
    [CHAIN.BASE]: { start: '2024-11-22' },
    [CHAIN.BSC]: { start: '2025-04-10' },
    [CHAIN.HYPERLIQUID]: { start: '2025-04-04' },
    [CHAIN.MONAD]: { start: '2025-11-23' },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
