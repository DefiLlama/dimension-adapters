import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
    base: {
      morphoVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
    bsc: {
      eulerVaultOwners: [
        '0x3B8DfE237895f737271371F339eEcbd66Face43e',
        '0xf726311F85D45a7fECfFbC94bD8508a0A39958c6',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
