import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { secondsInDay } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

const ADAPTER = "3PHTxmSNQsrZocZRAWidNbdcxqRpzHiK5Mt";
const WAVES_NODE = "https://nodes.wavesnodes.com";
const MILLISECONDS_IN_SECOND = 1_000;
const LIMIT_PER_REQUEST = 99;
const WAVES_DIVIDER = 1e8;
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
    return (await fetchURL(`${WAVES_NODE}/addresses/data/${address}/${key}`)).data
}

const getHeaders = async (start: number, end: number): Promise<IBlockHeader[]> => {
    return (await fetchURL(`${WAVES_NODE}/blocks/headers/seq/${start}/${end}`)).data
}

const extractShareReward = (rewardShares: RewardShares, miner: string): number => {
    return Object.entries(rewardShares).reduce((acc, [address, reward]) => {
        let shareReward = address === miner ? reward : 0;
        return acc + shareReward;
    }, 0)
}

const fetch = async (timestamp: number) => {
    let miner = (await getData(ADAPTER, "ADAPTEE")).value;
    let feeRate = +(await getData(ADAPTER, "FEE_RATE")).value / FEE_DIVIDER;

    const fromTimestamp = (timestamp - secondsInDay) * MILLISECONDS_IN_SECOND;
    const toTimestamp = timestamp * MILLISECONDS_IN_SECOND;

    let startBlock = (await getBlock(fromTimestamp, CHAIN.WAVES, {}));
    const endBlock = (await getBlock(toTimestamp, CHAIN.WAVES, {}));
    const wavesToken = "waves:WAVES";
    const price = (await getPrices([wavesToken], timestamp))[wavesToken]?.price;

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
    let stakingRewardsInUSD = mainerBlocHeaders.reduce((acc, header) => {
        let txReward = header.totalFee;
        return acc + txReward + extractShareReward(header.rewardShares, miner.toString());
    }, 0) / WAVES_DIVIDER * price;
    let protocolRevenue = stakingRewardsInUSD * feeRate;

    return {
        timestamp,
        dailyFees: stakingRewardsInUSD.toString(),
        dailyRevenue: protocolRevenue.toString(),
        dailyHoldersRevenue: '0'
    };
};

const adapter: Adapter = {
    adapter: {
        [CHAIN.WAVES]: {
            fetch,
            start: async () => 1667250000 // Mon Oct 31 2022 21:00:00 GMT+0000
        },
    },
}

export default adapter;
