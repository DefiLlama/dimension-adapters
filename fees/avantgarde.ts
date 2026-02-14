import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { METRIC } from "../helpers/metrics";

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest and yields generated from deposited assets in all Morpho and Euler vaults curated by Avantgarde',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Performance fees and management fees collected by Avantgarde for curating vaults (typically a percentage of yields generated)',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Net yields distributed to vault depositors and investors after curator fees are deducted',
  },
};

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total yields from deposited assets in all curated vaults.',
    Revenue: 'Yields are collected by curators.',
    ProtocolRevenue: 'Yields are collected by curators.',
    SupplySideRevenue: 'Yields are distributed to vaults depositors/investors.',
  },
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0xb263237E30fe9be53d6F401FCC50dF125D60F01a',
      ],
    },
  }
}

const adapter = getCuratorExport(curatorConfig);
adapter.breakdownMethodology = breakdownMethodology;

export default adapter
