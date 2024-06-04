import { Chain } from "@defillama/sdk/build/general";
import { FetchResult, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";

let abi = ["event Swap(address indexed payer,address indexed payee,address fromToken,address toToken,uint fromAmount,uint receivedAmount)"];

type IContract = {
    [c: string | Chain]: string;
}

const contract: IContract = {
    [CHAIN.BSC]: '0x15Fa1b705D85Cf35b625d0Afa3Ab4360b92D019a',
    [CHAIN.POLYGON]:'0xc6C4013D6f7D4313634798D6E516ef72D1912915',
    [CHAIN.ETHEREUM]:'0x94aa97b013b9b1cc7915199e8621ddf664646339',
    [CHAIN.BASE]:'0x94aa97b013b9b1cc7915199e8621ddf664646339'

}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, }): Promise<FetchResultV2> => {
    const dailyVolume = createBalances();
    const logs = (await getLogs({ target: contract[chain], eventAbi: abi[0], }))

    logs.map((log: any) => dailyVolume.add(log.toToken, log.receivedAmount));

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: 1701388800,
                runAtCurrTime:false
            },
        }
    }, {}),
    version: 2,
};
export default adapter;