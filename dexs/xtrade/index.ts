import { uniV3Exports } from '../../helpers/uniswap'

const poolEvent = 'event Pool(address indexed token0,address indexed token1,address pool)'
export default uniV3Exports({
  xlayer: {
    poolCreatedEvent: poolEvent,
    factory: '0x612D9EA08be59479B112D8d400C7F0A2E4aD4172',
  },
})
