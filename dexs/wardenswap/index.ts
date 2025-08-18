import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.BSC]: { factory: '0x3657952d7bA5A0A4799809b5B6fdfF9ec5B46293', start: '2021-06-23'},
})