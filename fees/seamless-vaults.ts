import { CHAIN } from '../helpers/chains';
import { CuratorConfig, getCuratorExport } from '../helpers/curators';

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.BASE]: {
      morpho: [
        '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738',
        '0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18',
        '0x5a47C803488FE2BB0A0EAaf346b420e4dF22F3C7',
      ],
      start: '2025-01-21',
    },
  },
};

export default getCuratorExport(curatorConfig);
