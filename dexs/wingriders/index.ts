import { Adapter, ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url: string = "https://api.mainnet.wingriders.com/v1/defillama";

async function fetch(options: FetchOptions) {
    const data = await fetchURL(url);

    const getBalances = (valueInAda: any) => {
        const balances = options.createBalances();
        balances.addCGToken('cardano', Number(valueInAda));
        return balances;
    }

    const dailyVolume = getBalances(data.dailyVolume);
    const dailyFees = getBalances(data.dailyFees);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.CARDANO],
    runAtCurrTime: true,
}

export default adapter;
