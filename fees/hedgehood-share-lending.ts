import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

// HedgeHood Share Lending: hhUSDG, a Morpho Vault V2 that lends USDG against Stock Yield fund shares (hhNVDA-CC) in
// its own Morpho Blue market. Same vault as the curator TVL entry (DefiLlama-Adapters registries/curators.js).
const curatorConfig: CuratorConfig = {
  breakdownFees: true,
  vaults: {
    [CHAIN.ROBINHOOD]: {
      morphoV2: [
        '0x54Bc097643BB9fd4ab004f11859893655529E954', // hhUSDG
      ],
      start: '2026-10-27', // the vault's deployment
    },
  },
};

export default getCuratorExport(curatorConfig);
