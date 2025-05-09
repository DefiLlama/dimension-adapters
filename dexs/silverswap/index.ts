import { fetchVolume } from "./getAlgebraData";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
	  [CHAIN.SONIC]: {
		fetch: fetchVolume,
			start: "2024-12-07",
		
	  },
	},
  };
  //
  export default adapter;
  