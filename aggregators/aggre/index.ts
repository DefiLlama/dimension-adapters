import {Chain} from "@defillama/sdk/build/general";
import {FetchResultAggregators, FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getBlock} from "../../helpers/getBlock";
import {ethers} from "ethers";
import {getPrices} from "../../utils/prices";
import {CHAIN} from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const eventSignature = 'SwapExecuted(address,address,address,uint256,uint256,uint256)'

let abi = [ "event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint amountIn, uint amountOut, uint swapType)" ];
let iface = new ethers.Interface(abi);

type IContract = {
    [c: string | Chain]: string;
}

const contract: IContract = {
    [CHAIN.SCROLL]: '0xcf8bcaCb401C31774EA39296b367B9DaB4F72267',
}

interface EthLog {
    address: string;
    data: string;
    transactionHash: string;
    topics: string[];
}

interface AggreData {
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
}

const fetch = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultAggregators> => {
        const fromTimestamp = timestamp - 60 * 60 * 24;
        const toTimestamp = timestamp;

        try {
            const fromBlock = (await getBlock(fromTimestamp, chain, {}));
            const toBlock = (await getBlock(toTimestamp, chain, {}));

            let provider =  sdk.api.config.getProvider(CHAIN.SCROLL);

            if (!provider) {
                sdk.api.config.setProvider(CHAIN.SCROLL, new ethers.JsonRpcProvider('https://rpc.scroll.io'));
            }

            const swapTopic = ethers.id(eventSignature);
            const logs = (await sdk.getEventLogs({
                target: contract[chain],
                topic: swapTopic,
                toBlock: toBlock,
                fromBlock: fromBlock,
                chain,
                topics: [swapTopic]
            }))

            const data = logs.map((e: any) => {
                const parsed = iface.parseLog(e);
                return {
                    fromToken: parsed!.args.tokenIn,
                    toToken: parsed!.args.tokenOut,
                    fromAmount: parsed!.args.amountIn,
                    toAmount: parsed!.args.amountOut
                }
            });
            const coins: string[] = [...new Set([...new Set(data.map((e: AggreData) => `${chain}:${e.fromToken}`)), ...new Set(data.map((e: AggreData) => `${chain}:${e.toToken}`))])];
            const prices = await getPrices(coins, timestamp);
            const VUSD = data.map((e: AggreData) => {
                const fromPrice = prices[`${chain}:${e.fromToken}`]?.price || 0;
                const toPrice = prices[`${chain}:${e.toToken}`]?.price || 0;
                const fromDecimals = prices[`${chain}:${e.fromToken}`]?.decimals || 0;
                const toDecimals = prices[`${chain}:${e.toToken}`]?.decimals || 0;
                const fromAmount = (e.fromAmount / 10 ** fromDecimals) * fromPrice;
                const toAmount = (e.toAmount / 10 ** toDecimals) * toPrice;
                return fromPrice ? fromAmount : toAmount;
            }).reduce((a: number, b: number) => a + b, 0);


            return {
                dailyVolume: `${VUSD}`,
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