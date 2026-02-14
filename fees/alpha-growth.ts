import { CHAIN } from "../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { METRIC } from "../helpers/metrics";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.UNICHAIN]: {
      eulerVaultOwners: [
        '0x8d9fF30f8ecBA197fE9492A0fD92310D75d352B9',
      ],
    },
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest earned from deposited assets in all curated Euler vaults',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Portion of interest retained by Alpha Growth as curator fees',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Portion of interest distributed to vault depositors after curator fees',
  }
};

const adapter = getCuratorExport(curatorConfig);
adapter.breakdownMethodology = breakdownMethodology;

export default adapter;
