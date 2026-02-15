import { METRIC } from "../helpers/metrics";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { SimpleAdapter } from "../adapters/types";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      eulerVaultOwners: [
        '0x0d8249DD621fB1c386A7A7A949504035Dd3436A3',
      ],
    },
  }
}

const curatorExport = getCuratorExport(curatorConfig);

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest earned from deposited assets in curated Euler vaults, representing the gross yield generated before curator fees',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator fees collected by Alterscope from vault interest yields',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator fees collected by Alterscope from vault interest yields',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Net interest distributed to vault depositors after deducting curator fees',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: curatorExport.adapter,
  methodology: curatorExport.methodology,
  breakdownMethodology,
};

export default adapter;
