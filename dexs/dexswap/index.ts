import { FetchOptions } from "../../adapters/types"
import { exportDexVolumeAndFees } from "../../helpers/dexVolumeLogs";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY_ADDRESS = '0x3e40739d8478c58f9b973266974c58998d4f9e8b';
const startDate = 1684702800;

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: (options: FetchOptions) => exportDexVolumeAndFees({ chain: CHAIN.ARBITRUM, factory: FACTORY_ADDRESS })(options.endTimestamp, {}, options),
			start: startDate,
		},
	}
};

export default adapter;
