import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

const graph = (_chain: Chain) => {
	return async (timestamp: number) => {
		timestamp = Math.floor(Date.now() / 1000)
		const fromTimestamp = timestamp - 60 * 60
		const toTimestamp = timestamp
		return getDexVolume({ chain: _chain, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
	}
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.KCC]:		{ fetch: graph(CHAIN.KCC),		start: async () => 1670188701 },
		//[CHAIN.MULTIVAC]:	{ fetch: graph(CHAIN.MULTIVAC),	start: async () => 1670226950 },	/// ! typeof CHAIN
		[CHAIN.FANTOM]: 	{ fetch: graph(CHAIN.FANTOM),	start: async () => 1671580916 },
		//[CHAIN.ECHELON]:	{ fetch: graph(CHAIN.ECHELON),	start: async () => 1671608400 },	/// ded!?
		[CHAIN.KAVA]:		{ fetch: graph(CHAIN.KAVA),		start: async () => 1676855943 }
	}
};

export default adapter;