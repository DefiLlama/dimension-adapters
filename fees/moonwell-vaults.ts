import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";

// Moonwell's Morpho vaults are listed explicitly rather than discovered by owner: the
// factory records the deploying EOA as initialOwner and ownership was later moved to
// Moonwell's governor, so owner-based discovery matches none of them. That same deployer
// also created Relend ETH, which belongs to a different protocol and must stay out.
const curatorConfig: CuratorConfig = {
  breakdownFees: true,
  vaults: {
    [CHAIN.BASE]: {
      morpho: [
        '0xc1256ae5ff1cf2719d4937adb3bbccab2e00a2ca', // Moonwell Flagship USDC
        '0xa0e430870c4604ccfc7b38ca7845b1ff653d0ff1', // Moonwell Flagship ETH
        '0xf24608e0ccb972b0b0f4a6446a0bbf58c701a026', // Moonwell Flagship EURC
        '0x543257ef2161176d7c8cd90ba65c2d4caef5a796', // Moonwell Frontier cbBTC
      ],
      start: '2024-06-10',
    },
  },
}

export default getCuratorExport(curatorConfig)
