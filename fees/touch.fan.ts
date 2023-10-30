import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const fan_address = '0x9842114F1d9c5286A6b8e23cF0D8142DAb2B3E9b';
const touch_address = `0xC612eD7a1FC5ED084C967bD71F1e0F0a338Cf816`
const topic0_trade = '0x2c76e7a47fd53e2854856ac3f0a5f3ee40d15cfaa82266357ea9779c486ab9c3';
const topic1_trade = '0x2c76e7a47fd53e2854856ac3f0a5f3ee40d15cfaa82266357ea9779c486ab9c3';
const event_trade_fan = ' event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 referrerEthAmount, uint256 supply, uint256 trader_balance, uint256 blockTime);'
const event_trade_touch = `event Trade(address trader,uint256 CommunityID,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 referrerEthAmount,uint256 supply,uint256 trader_balance,uint256 blockTime);`
const contract_fan_interface = new ethers.utils.Interface([
    event_trade_fan
]);

const contract_touch_interface = new ethers.utils.Interface([
    event_trade_touch
]);

interface ILog {
    data: string;
    transactionHash: string;
    topics: string[];
}

interface IFee {
    fees: number;
    rev: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
    // 
    const fromTimestamp = timestamp - 60 * 60 * 24
    // 
    const toTimestamp = timestamp

    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ERA, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ERA, {}));
    try {
        let _logs: ILog[] = [];
        let _logs1: ILog[] = [];
        for (let i = fromBlock; i < toBlock; i += 5000) {
            const logs: ILog[] = (await sdk.api.util.getLogs({
                target: fan_address,
                topic: '',
                toBlock: i + 5000,
                fromBlock: i,
                keys: [],
                chain: CHAIN.BASE,
                topics: [topic0_trade]
            })).output as ILog[];
            _logs = _logs.concat(logs);
        }

        for (let i = fromBlock; i < toBlock; i += 5000) {
            const logs: ILog[] = (await sdk.api.util.getLogs({
                target: touch_address,
                topic: '',
                toBlock: i + 5000,
                fromBlock: i,
                keys: [],
                chain: CHAIN.BASE,
                topics: [topic1_trade]
            })).output as ILog[];
            _logs1 = _logs1.concat(logs);
        }
        const fan_fees_details: IFee[] = _logs.map((e: ILog) => {
            const value = contract_fan_interface.parseLog(e);
            console.log("value",value)
            const protocolEthAmount = Number(value.args.protocolEthAmount._hex) / 10 ** 18;
            const subjectEthAmount = Number(value.args.subjectEthAmount._hex) / 10 ** 18;
            const refferEthAmount = Number(value.args.referrerEthAmount._hex) / 10 ** 18;
            return {
                fees: protocolEthAmount + subjectEthAmount + refferEthAmount,
                rev: protocolEthAmount
            } as IFee
        })
        const touch_fees_details: IFee[] = _logs1.map((e: ILog) => {
            const value = contract_touch_interface.parseLog(e);
           
            const protocolEthAmount = Number(value.args.protocolEthAmount._hex) / 10 ** 18;
            const referrerEthAmount = Number(value.args.referrerEthAmount._hex) / 10 ** 18;

            return {
                fees: protocolEthAmount + referrerEthAmount,
                rev: protocolEthAmount
            } as IFee
        })
        let fees = [...fan_fees_details, ...touch_fees_details]
        const dailyFees = fees.reduce((a: number, b: IFee) => a + b.fees, 0)
        const dailyRev = fees.reduce((a: number, b: IFee) => a + b.rev, 0)
        const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
        const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
        const dailyFeesUSD = (dailyFees) * ethPrice;
        const dailyRevUSD = (dailyRev) * ethPrice;
        return {
            dailyFees: `${dailyFeesUSD}`,
            dailyRevenue: `${dailyRevUSD}`,
            timestamp
        }
    } catch (error) {
        console.error(error)
        throw error;
    }

}


const adapter: Adapter = {
    adapter: {
        [CHAIN.ERA]: {
            fetch: fetch,
            start: async () => 1698498000,
        },
    }
}

export default adapter;