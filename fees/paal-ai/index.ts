import * as sdk from "@defillama/sdk";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { CHAIN } from "../../helpers/chains";

/** Address to check = paalecosystemfund.eth */
const CONTRACT_ADDRESS = "0x54821d1B461aa887D37c449F3ace8dddDFCb8C0a";

/** Check ether balance at a given block number*/
interface IBalance {
    daily: string;
    total: string;
}

const checkBalance = async (timestamp: number, chainBlocks: ChainBlocks): Promise<IBalance> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const currentBlock = await getBlock(toTimestamp, CHAIN.ETHEREUM, chainBlocks);
    const yesterdayBlock = await getBlock(fromTimestamp, CHAIN.ETHEREUM, {});

    const paramsCurrent = {
        target: CONTRACT_ADDRESS,
        block: currentBlock,
        chain: CHAIN.ETHEREUM,
    }

    const paramsYesterday = {
        target: CONTRACT_ADDRESS,
        block: yesterdayBlock,
        chain: CHAIN.ETHEREUM,
    }

    const currentBalance = (await getBalance(paramsCurrent)).output;
    const yesterdayBalance = (await getBalance(paramsYesterday)).output;

    return {
        daily: (Number(currentBalance) - Number(yesterdayBalance)).toString(),
        total: Number(currentBalance).toString()
    } as IBalance
}

/** Calculate USD equivalent for a given ether amount */
async function usdEquivalent(ethBalance: string, timeStamp: number) {
    const etherAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const etherPrice = (await getPrices([etherAddress], timeStamp))[etherAddress].price;
    const dailyFees = ((Number(ethBalance) / 1e18) * Number(etherPrice)).toString()
    return dailyFees;
}

/** Adapter */
const adapter: Adapter = {
    adapter: {
        ethereum: {
            fetch: async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
                const { daily } = await checkBalance(timestamp, chainBlocks);
                const dailyFees = await usdEquivalent(daily, timestamp)
                return {
                    timestamp,
                    dailyFees: dailyFees.toString(),
                };
            },
            start: async () => 1633478400, //Wed Oct 06 2021 00:00:00 GMT+0000
        },
    },
}

export default adapter;
