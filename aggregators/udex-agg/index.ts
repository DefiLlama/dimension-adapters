import ADDRESSES from '../../helpers/coreAssets.json'
import { Chain } from "../../adapters/types";
import { FetchResult, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

let abi = ["event Swap(address indexed payer,address indexed payee,address fromToken,address toToken,uint fromAmount,uint receivedAmount)"];
let knownTokens=new Set([ADDRESSES.bsc.WBNB,ADDRESSES.bsc.USDT,ADDRESSES.bsc.USDC])
type IContract = {
    [c: string | Chain]: string;
}

const contract: IContract = {
    [CHAIN.BSC]: '0xfCD555b55AA785d46E8c6e9bBB109b10602c431c',
    [CHAIN.POLYGON]:'0x464599BDaC77E8e5843D5BbC531EC8aD75d3F7b1',
    [CHAIN.ETHEREUM]:'0x9556E8ce70ceA3c43e4A6c17ad2FAb258067b058',
    [CHAIN.BASE]:'0x334F493613c1dD33a364684802fB9C728dfcE1A5',
    [CHAIN.OP_BNB]:'0x8A3e34e45b76885001aa024d6F35FBAcfDBd9DB0'

}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, }): Promise<FetchResultV2> => {
    const dailyVolume = createBalances();
    const logs = (await getLogs({ target: contract[chain], eventAbi: abi[0] }))
    logs.map((log: any) => {
        if ( knownTokens.has(log.toToken)){
            dailyVolume.add(log.toToken, log.receivedAmount)
        }else{
            dailyVolume.add(log.fromToken, log.fromAmount)
        }
        });
    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2024-09-17',
            },
        }
    }, {}),
    version: 2,
};
export default adapter;