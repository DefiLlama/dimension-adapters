import { CHAIN } from '../helpers/chains';
import { CuratorConfig, getCuratorExport } from '../helpers/curators';

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.BASE]: {
      morphoVaultOwners: ['0x639d2dD24304aC2e6A691d8c1cFf4a2665925fee'],
      start: '2025-01-21',
    },
  },
};

export default getCuratorExport(curatorConfig);
