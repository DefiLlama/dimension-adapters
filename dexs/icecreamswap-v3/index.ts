import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap"

const FACTORY_ADDRESS = '0xa8a3AAD4f592b7f30d6514ee9A863A4cEFF6531D'

const adapter: SimpleAdapter = uniV3Exports({
  [CHAIN.CORE]: {
    factory: FACTORY_ADDRESS,
  }
})

export default adapter;