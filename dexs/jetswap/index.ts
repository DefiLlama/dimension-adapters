import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

// https://docs.jetswap.finance/exchange-information/platform-fees
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% on BSC, 0.1% on Fantom, Polygon per swap.',
    UserFees: 'Users pay 0.3% on BSC, 0.1% on Fantom, Polygon per swap.',
    Revenue: 'Protocol collects 16% swap fees on BSC and 50% swap fees on Fantom, Polygon.',
    ProtocolRevenue: 'Protocol collects 16% swap fees on BSC and 50% swap fees on Fantom, Polygon.',
    SupplySideRevenue: '84% swap fees on BSC and 50% swap fees on Fantom, Polygon distributed to LPs.',
  },
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x0eb58E5c8aA63314ff5547289185cC4583DfCBD5', userFeesRatio: 1, revenueRatio: 0.05 / 0.3, protocolRevenueRatio: 0.05 / 0.3, blacklistedAddresses: ['0x81eE41C232e2c7fba40c9EaC02ae1eAE33570382'], }) },
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0x668ad0ed2622C62E24f0d5ab6B6Ac1b9D2cD4AC7', userFeesRatio: 1, revenueRatio: 0.5, protocolRevenueRatio: 0.5 }) },
    [CHAIN.FANTOM]: { fetch: getUniV2LogAdapter({ factory: '0xf6488205957f0b4497053d6422F49e27944eE3Dd', userFeesRatio: 1, revenueRatio: 0.5, protocolRevenueRatio: 0.5 }) },
  },
}

export default adapter;