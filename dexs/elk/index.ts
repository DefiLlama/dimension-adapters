import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.XDAI]: { fetch: getUniV2LogAdapter({ factory: '0xCB018587dA9590A18f49fFE2b85314c33aF3Ad3B', ...config }) },
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0xE3BD06c7ac7E1CeB17BdD2E5BA83E40D1515AF2a', ...config }) },
    [CHAIN.FANTOM]: { fetch: getUniV2LogAdapter({ factory: '0x7Ba73c99e6f01a37f3e33854c8F544BbbadD3420', ...config }) },
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x31aFfd875e9f68cd6Cd12Cee8943566c9A4bBA13', ...config }) },
    [CHAIN.AVAX]: { fetch: getUniV2LogAdapter({ factory: '0x091d35d7F63487909C863001ddCA481c6De47091', ...config }) },
    [CHAIN.MOONRIVER]: { fetch: getUniV2LogAdapter({ factory: '0xd45145f10fD4071dfC9fC3b1aefCd9c83A685e77', ...config }) },
    [CHAIN.ETHEREUM]: { fetch: getUniV2LogAdapter({ factory: '0x6511eBA915fC1b94b2364289CCa2b27AE5898d80', ...config }) },
    [CHAIN.OPTIMISM]: { fetch: getUniV2LogAdapter({ factory: '0xedfad3a0F42A8920B011bb0332aDe632e552d846', ...config }) },
    [CHAIN.ARBITRUM]: { fetch: getUniV2LogAdapter({ factory: '0xA59B2044EAFD15ee4deF138D410d764c9023E1F0', ...config }) },
    [CHAIN.METIS]: { fetch: getUniV2LogAdapter({ factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', ...config }) },
    [CHAIN.BASE]: { fetch: getUniV2LogAdapter({ factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', ...config }) },
    [CHAIN.LINEA]: { fetch: getUniV2LogAdapter({ factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', ...config }) },
  },
}

export default adapter;
