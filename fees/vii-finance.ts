import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: "Fees paid from token swaps from assets deployed by Vii vaults.",
    SupplySideRevenue: "All fees and interest are distributed to LPs.",
  },
  vaults: {
    [CHAIN.UNICHAIN]: {
      start: '2025-09-01',
      eulerVaultOwners: [
        '0x12e74f3C61F6b4d17a9c3Fdb3F42e8f18a8bB394',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
