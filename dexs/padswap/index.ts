import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0xB836017ACf10b8A7c6c6C9e99eFE0f5B0250FC45' }), start: 1620518400 },
    [CHAIN.MOONRIVER]: { fetch: getUniV2LogAdapter({ factory: '0x760d2Bdb232027aB3b1594405077F9a1b91C04c1' }), start: 1635638400 },
    [CHAIN.MOONBEAM]: { fetch: getUniV2LogAdapter({ factory: '0x663a07a2648296f1A3C02EE86A126fE1407888E5' }), start: 1642032000 },
  },
}

export default adapter;
