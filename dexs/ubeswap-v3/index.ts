import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.CELO]: {
			fetch: getUniV3LogAdapter({
				factory: "0x67FEa58D5a5a4162cED847E13c2c81c73bf8aeC4",
			}),
			start: "2024-05-20",
		},
	},
};

export default adapter;
