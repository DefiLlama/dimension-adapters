import { uniV2Exports } from "../helpers/uniswap";

// https://docs.octo.exchange/resources-faq#6-what-are-the-trading-fees
export default uniV2Exports({ 
  monad: {
    factory: '0xCe104732685B9D7b2F07A09d828F6b19786cdA32',
    revenueRatio: 1/6,
    protocolRevenueRatio: 1/6,
  }
})
