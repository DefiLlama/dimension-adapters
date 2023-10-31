import * as sdk from "@defillama/sdk";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";

/** Address to check = paalecosystemfund.eth */
const CONTRACT_ADDRESS = "0x54821d1B461aa887D37c449F3ace8dddDFCb8C0a";

/** Check ether balance at a given block number*/
async function checkBalance(timeStamp: number) {
    const currentBlock = await getBlock(timeStamp, "ethereum", {});
    const yesterdayBlock = await getBlock(timeStamp - 86400, "ethereum", {});

    //const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp) // Not used by now but would be useful in the future
    //const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp) // Not used by now but would be useful in the future
     
    const paramsCurrent = {
        target: CONTRACT_ADDRESS,
        block: currentBlock,
        chain: [CHAIN.ETHEREUM].toString(),
    }

    const paramsYesterday = {
        target: CONTRACT_ADDRESS,
        block: yesterdayBlock,
        chain: [CHAIN.ETHEREUM].toString(),
    }

    const currentBalance = (await getBalance(paramsCurrent)).output;
    const yesterdayBalance = (await getBalance(paramsYesterday)).output;

    return (Number(currentBalance) - Number(yesterdayBalance)).toString();
}

/** Calculate USD equivalent for a given ether amount */
async function usdEquivalent(ethBalance: string, timeStamp: number) {
    const etherAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const etherPrice = (await getPrices([etherAddress], timeStamp))[etherAddress].price;
    return ((Number(ethBalance) / 1e18) * Number(etherPrice)).toString();    
}

/** Adapter */
const adapter: Adapter = {
    adapter: {
        ethereum: {
            fetch: async (timestamp: number) => {
                const balance = await checkBalance(timestamp);
                return {
                    timestamp,
                    totalFees: balance.toString(),
                    totalFeesUsd: await usdEquivalent(balance, timestamp),
                };
            },
            start: async () => 1633478400, //Wed Oct 06 2021 00:00:00 GMT+0000            
        },
    },
}

export default adapter;