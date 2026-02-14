import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { SimpleAdapter } from "../adapters/types";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.ETHEREUM]: {
      morphoVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
    [CHAIN.BASE]: {
      morphoVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
    [CHAIN.BSC]: {
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
  }
}

const curatorExport = getCuratorExport(curatorConfig);

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest earned from deposited assets across all curated vaults (Morpho and Euler), representing the gross yield generated before curator fees',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator performance fees and management fees collected by Apostro from vault yields',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Curator performance fees and management fees collected by Apostro from vault yields',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Net yields distributed to vault depositors after deducting curator fees',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: curatorExport.adapter,
  methodology: curatorExport.methodology,
  breakdownMethodology,
};

export default adapter;
