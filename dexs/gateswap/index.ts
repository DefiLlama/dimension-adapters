import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
	version: 2,
	methodology: {
		Volume: 'Total swap volume collected from factory 0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2',
	},
	start: '2025-09-27',
	chains: [CHAIN.GATELAYER],
	fetch: getUniV2LogAdapter({ 
        factory: '0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2', 
        fees: 0, 
    }),
}

export default adapter