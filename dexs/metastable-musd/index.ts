import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const M_USD_VAULT_ID =
	"0xb950819c5eba1bb5980f714f2a3b1d8738e3da58a4d9daf5fa21b6c2a7dd1e12";
const URL = `https://aftermath.finance/api/metastable/${M_USD_VAULT_ID}/24hr-volume`;

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
			start: "2024-01-14",
		},
	},
};

export default adapter;
