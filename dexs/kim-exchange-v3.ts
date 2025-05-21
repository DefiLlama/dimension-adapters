import { uniV3Exports } from "../helpers/uniswap";

const poolEvent = 'event Pool(address indexed token0,address indexed token1,address pool)'
export default uniV3Exports({
  mode: {
    poolCreatedEvent: poolEvent,
    factory: '0xB5F00c2C5f8821155D8ed27E31932CFD9DB3C5D5',
  },
})
