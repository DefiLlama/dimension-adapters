import {Chain} from "@defillama/sdk/build/general";
import {FetchResultAggregators, SimpleAdapter} from "../../adapters/types";
import {getBlock} from "../../helpers/getBlock";
import {CHAIN} from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

let abi = [ "event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint amountIn, uint amountOut, uint swapType)" ];

type IContract = {
    [c: string | Chain]: string;
}

const contract: IContract = {
    [CHAIN.SCROLL]: '0xcf8bcaCb401C31774EA39296b367B9DaB4F72267',
}

const fetch = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultAggregators> => {
        const fromTimestamp = timestamp - 60 * 60 * 24;
        const toTimestamp = timestamp;


        try {
            const api = new sdk.ChainApi({chain, timestamp});
            const fromBlock = (await getBlock(fromTimestamp, chain, {}));
            const toBlock = (await getBlock(toTimestamp, chain, {}));
            const logs = (await api.getLogs({
                target: contract[chain],
                toBlock: toBlock,
                fromBlock: fromBlock,
                chain,
                eventAbi: abi[0],
                onlyArgs: true,
            }))

            logs.map((parsed: any) => {
                api.add(parsed.tokenOut, parsed.amountOut)
            });
            const VUSD = Number(await api.getUSDValue()).toFixed(0);

            return {
                dailyVolume: VUSD,
                timestamp,
            };
        } catch (e) {
            console.log('err::', e);
        }

        return {
            dailyVolume: '0',
            block: 0,
            timestamp: 0,
            totalVolume: ""
        }
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chain),
                start: async () => 1698660910,
            }
        }
    }, {})
};

export default adapter;