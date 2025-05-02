import { Adapter, ChainBlocks, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ADAPTER = "3PHTxmSNQsrZocZRAWidNbdcxqRpzHiK5Mt";
const WAVES_NODE = "https://nodes.wavesnodes.com";
const LIMIT_PER_REQUEST = 99;
const FEE_DIVIDER = 1e4;

interface IData {
    key: string,
    value: DataValue
}
type DataValue = string | number;

interface IBlockHeader {
    totalFee: number,
    generator: string,
    rewardShares: RewardShares
}
type RewardShares = { [address: string]: number };

const getData = async (address: string, key: string): Promise<IData> => {
    return fetchURL(`${WAVES_NODE}/addresses/data/${address}/${key}`)
}

const getHeaders = async (start: number, end: number): Promise<IBlockHeader[]> => {
    return fetchURL(`${WAVES_NODE}/blocks/headers/seq/${start}/${end}`)
}

const extractShareReward = (rewardShares: RewardShares, miner: string): number => {
    return Object.entries(rewardShares).reduce((acc, [address, reward]) => {
        let shareReward = address === miner ? reward : 0;
        return acc + shareReward;
    }, 0)
}

const fetch = async ({ createBalances, getFromBlock, getToBlock, }: FetchOptions) => {
    let miner = (await getData(ADAPTER, "ADAPTEE")).value;
    let feeRate = +(await getData(ADAPTER, "FEE_RATE")).value / FEE_DIVIDER;

    const dailyFees = createBalances()
    let startBlock = await getFromBlock();
    const endBlock = await getToBlock()
    const wavesToken = "WAVES";

    let blockHeaders: IBlockHeader[] = [];
    while (startBlock < endBlock) {
        if (startBlock + LIMIT_PER_REQUEST <= endBlock) {
            blockHeaders = blockHeaders.concat(await getHeaders(startBlock, startBlock + LIMIT_PER_REQUEST));
            startBlock += LIMIT_PER_REQUEST;
        } else {
            blockHeaders = blockHeaders.concat(await getHeaders(startBlock, endBlock));
            break;
        }
    }
    let mainerBlocHeaders = blockHeaders.filter(header => header.generator === miner);
    dailyFees.add(wavesToken, mainerBlocHeaders.reduce((acc, header) => {
        let txReward = header.totalFee;
        return acc + txReward + extractShareReward(header.rewardShares, miner.toString());
    }, 0))
    const dailyRevenue = dailyFees.clone()
    dailyRevenue.resizeBy(feeRate)

    return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.WAVES]: {
            fetch,
            start: '2022-10-31' // Mon Oct 31 2022 21:00:00 GMT+0000
        },
    },
}

export default adapter;
