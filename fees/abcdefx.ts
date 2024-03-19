import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDexFeesExports } from "../helpers/dexVolumeLogs";
import { Chain } from "@defillama/sdk/build/general";

const FACTORY_ADDRESS = '0x01f43d2a7f4554468f77e06757e707150e39130c';

const graph = (_chain: Chain) => {
	// LPs get 0% fees, 100% goes to Guru's Treasury, which buys back ELITE
	return getDexFeesExports({ chain: _chain, factory: FACTORY_ADDRESS })
}

const methodology = {
  UserFees: "Users pay a Trading fee on each swap, including Flash Loans.",
  Fees: "Net Trading fees paid by all ABcDeFx users.",
  Revenue: "100% of the trading fee is collected by Protocol.",
  ProtocolRevenue: "100% of the trading fee is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Trade Fees is used to buyback ELITE.",
  SupplySideRevenue: "0% of trading fees are distributed among liquidity providers."
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.KCC]:		{ fetch: graph(CHAIN.KCC),		start: 1670188701,	meta: { methodology }	},
		//[CHAIN.MULTIVAC]:	{ fetch: graph(CHAIN.MULTIVAC),	start: 1670226950,	meta: { methodology }	},	/// ! typeof CHAIN
		[CHAIN.FANTOM]: 	{ fetch: graph(CHAIN.FANTOM),	start: 1671580916,	meta: { methodology }	},
		//[CHAIN.ECHELON]:	{ fetch: graph(CHAIN.ECHELON),	start: 1671608400,	meta: { methodology }	},	/// ded!?
		[CHAIN.KAVA]:		{ fetch: graph(CHAIN.KAVA),		start: 1676855943,	meta: { methodology }	}
	}
};

export default adapter;