import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getDexVolumeExports } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

const graph = (_chain: Chain) =>
	getDexVolumeExports({ chain: _chain, factory: FACTORY_ADDRESS })


const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.KCC]: { fetch: graph(CHAIN.KCC), start: 1670188701 },
		//[CHAIN.MULTIVAC]:	{ fetch: graph(CHAIN.MULTIVAC),	start: 1670226950 },	/// ! typeof CHAIN
		[CHAIN.FANTOM]: { fetch: graph(CHAIN.FANTOM), start: 1671580916 },
		//[CHAIN.ECHELON]:	{ fetch: graph(CHAIN.ECHELON),	start: 1671608400 },	/// ded!?
		[CHAIN.KAVA]: { fetch: graph(CHAIN.KAVA), start: 1676855943 }
	}
};

export default adapter;