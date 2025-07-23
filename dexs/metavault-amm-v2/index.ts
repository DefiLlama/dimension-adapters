import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.SCROLL]: { factory: '0xCc570Ec20eCB62cd9589FA33724514BDBc98DC7E', },
  [CHAIN.LINEA]: { factory: '0xCc570Ec20eCB62cd9589FA33724514BDBc98DC7E', },
})