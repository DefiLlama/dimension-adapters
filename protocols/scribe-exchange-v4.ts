import { uniV3Exports } from '../helpers/uniswap';

const poolEvent =
  'event Pool(address indexed token0,address indexed token1,address pool)';
export default uniV3Exports({
  scroll: {
    poolCreatedEvent: poolEvent,
    factory: '0xDc62aCDF75cc7EA4D93C69B2866d9642E79d5e2e',
  },
});
