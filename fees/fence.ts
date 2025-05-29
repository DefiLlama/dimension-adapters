import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xF92971B4D9e6257CF562400ed81d2986F28a8c26',
      ],
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
