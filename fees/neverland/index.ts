import { SimpleAdapter } from "../../adapters/types";
import { aaveExport, AaveLendingPoolConfig } from "../../helpers/aave";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Fees: 'Interest paid by borrowers, flashloan fees, and liquidation fees.',
  Revenue: 'Portion of fees going to Neverland protocol. veDUST holders vote to distribute 100% of revenue among: veDUST holder rewards, LP staking incentives, or DUST buybacks.',
  SupplySideRevenue: 'Portion of interest distributed to lenders.',
  ProtocolRevenue: 'Portion of fees going to Neverland protocol. veDUST holders vote to distribute 100% of revenue among: veDUST holder rewards, LP staking incentives, or DUST buybacks.',
}

const pools: Array<AaveLendingPoolConfig> = [
  {
    version: 3,
    lendingPoolProxy: '0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585',
    dataProvider: '0xfd0b6b6F736376F7B99ee989c749007c7757fDba',
  }
]

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: aaveExport({
    [CHAIN.MONAD]: {
      pools,
      start: '2025-11-24',
    }
  })
}

export default adapter
