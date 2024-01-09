import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const fan_address = '0x9842114F1d9c5286A6b8e23cF0D8142DAb2B3E9b';
const touch_address = `0xC612eD7a1FC5ED084C967bD71F1e0F0a338Cf816`
const topic0_trade = '0xc9d4f93ded9b42fa24561e02b2a40f720f71601eb1b3f7b3fd4eff20877639ee';
const topic1_trade = '0xc9eb3cd369a1da18b8489f028fd6a49d0aca6d6ad28c01fe1451126ce41a7fa4';
const event_trade_fan = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 referrerEthAmount, uint256 supply, uint256 trader_balance, uint256 blockTime)'
const event_trade_touch = `event Trade(address trader,uint256 CommunityID,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 referrerEthAmount,uint256 supply,uint256 trader_balance,uint256 blockTime)`
const contract_fan_interface = new ethers.Interface([
    event_trade_fan
]);

const contract_touch_interface = new ethers.Interface([
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
            const logs: ILog[] = (await sdk.getEventLogs({
                target: fan_address,
                toBlock: i + 5000,
                fromBlock: i,
                chain: CHAIN.ERA,
                topics: [topic0_trade]
            })) as ILog[];
            _logs = _logs.concat(logs);
        }

        for (let i = fromBlock; i < toBlock; i += 5000) {
            const logs: ILog[] = (await sdk.getEventLogs({
                target: touch_address,
                toBlock: i + 5000,
                fromBlock: i,
                chain: CHAIN.ERA,
                topics: [topic1_trade]
            })) as ILog[];
            _logs1 = _logs1.concat(logs);
        }

        const fan_fees_details: IFee[] = _logs.map((e: ILog) => {
            const value = contract_fan_interface.parseLog(e);
            const protocolEthAmount = Number(value!.args.protocolEthAmount) / 10 ** 18;
            const subjectEthAmount = Number(value!.args.subjectEthAmount) / 10 ** 18;
            const refferEthAmount = Number(value!.args.referrerEthAmount) / 10 ** 18;
            return {
                fees: protocolEthAmount + subjectEthAmount + refferEthAmount,
                rev: protocolEthAmount
            } as IFee
        })
        const touch_fees_details: IFee[] = _logs1.map((e: ILog) => {
            const value = contract_touch_interface.parseLog(e);

            const protocolEthAmount = Number(value!.args.protocolEthAmount) / 10 ** 18;
            const referrerEthAmount = Number(value!.args.referrerEthAmount) / 10 ** 18;

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
            start: async () => 1698494400,
        },
    }
}

export default adapter; 