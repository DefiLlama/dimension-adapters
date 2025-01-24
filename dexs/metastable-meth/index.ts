import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const M_ETH_VAULT_ID =
	"0x2d6e81126336685a28ea0637109b570510f988bba2b589877c9b579d3cb8cad8";
const URL = `https://aftermath.finance/api/metastable/${M_ETH_VAULT_ID}/24hr-volume`;

const fetch = async (timestamp: number): Promise<FetchResult> => {
	const dailyVolume = await fetchURL(`${URL}`);

	return {
		dailyVolume,
		timestamp,
	};
};

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.SUI]: {
			fetch,
			start: "2024-01-20",
		},
	},
};

export default adapter;
