import { Chain } from "@defillama/sdk/build/general";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

let abi = ["event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint amountIn, uint amountOut, uint swapType)"];

type IContract = {
    [c: string | Chain]: string;
}

const contract: IContract = {
    [CHAIN.SCROLL]: '0xcf8bcaCb401C31774EA39296b367B9DaB4F72267',
}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, }) => {
    const dailyVolume = createBalances();
    const logs = (await getLogs({ target: contract[chain], eventAbi: abi[0], }))

    logs.map((log: any) => dailyVolume.add(log.tokenOut, log.amountOut));

    return { dailyVolume, };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: 1698660910,
            }
        }
    }, {}),
    version: 2,
};

export default adapter;