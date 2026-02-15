import { METRIC } from "../helpers/metrics";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { SimpleAdapter } from "../adapters/types";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xEB4Af6fA3AFA08B10d593EC8fF87efB03BC04645',
      ],
    },
  }
}

const curatorExport = getCuratorExport(curatorConfig);

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest and yields earned from lending assets deposited in curated Morpho vaults, representing gross yield before curator fees',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator fees (performance fees and management fees) collected by Alphaping from vault yields',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator fees (performance fees and management fees) collected by Alphaping from vault yields',
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