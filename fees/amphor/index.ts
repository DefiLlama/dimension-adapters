import * as sdk from "@defillama/sdk";
import { ethers, EventFilter } from 'ethers';

import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { getBlock } from "../../helpers/getBlock";

const AmphorILHedgedWETH_contractAddress: string = '0xcDC51F2B0e5F0906f2fd5f557de49D99c34Df54e';
const AmphorLRTwstETHVault_contractAddress: string = '0x06824C27C8a0DbDe5F72f770eC82e3c0FD4DcEc3';

const contractAbi: ethers.InterfaceAbi = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "lastSavedBalance",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "returnedAssets",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "fees",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "totalShares",
                "type": "uint256"
            }
        ],
        "name": "EpochEnd",
        "type": "event"
    },
]

const AmphorILHedgedWETH_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedWETH_contractAddress, contractAbi);
const AmphorLRTwstETHVault_contract: ethers.Contract = new ethers.Contract(AmphorLRTwstETHVault_contractAddress, contractAbi);

const methodology = {
    UserFees: "Include performance fees.",
    Fees: "Includes all treasury revenue.",
    ProtocolRevenue: "Share of revenue going to Amphor treasury.",
    Revenue: "Sum of protocol revenue.",
}

const data = async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toBlock = await getBlock(toTimestamp, CHAIN.ETHEREUM, {});

    const eventFilterWETH: EventFilter = {
        address: AmphorILHedgedWETH_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterLRTwstETH: EventFilter = {
        address: AmphorLRTwstETHVault_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };

    const eventsWETH = (await sdk.getEventLogs({
        target: AmphorILHedgedWETH_contractAddress,
        topics: eventFilterWETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];

    const eventsLRTwstETH = (await sdk.getEventLogs({
        target: AmphorLRTwstETHVault_contractAddress,
        topics: eventFilterLRTwstETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];

    let totalRevenueWETH = BigInt(0);
    let totalFeesWSTETH = BigInt(0);
    let totalRevenueLRTwstETH = BigInt(0);
    let totalFeesLRTwstETH = BigInt(0);

    let dailyFeesWETH = BigInt(0);
    let dailyRevenueWSTETH = BigInt(0);
    let dailyFeeslRTwstETH = BigInt(0);
    let dailyRevenueLRTwstETH = BigInt(0);

    eventsWETH.forEach(res => {
        const event = AmphorILHedgedWETH_contract.interface.parseLog(res as any);
        totalRevenueWETH += BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        totalFeesWSTETH += BigInt(event!.args.fees)
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeesWETH += BigInt(event!.args.fees);
            dailyRevenueWSTETH = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance);
        }
    });

    eventsLRTwstETH.forEach(res => {
        const event = AmphorLRTwstETHVault_contract.interface.parseLog(res as any);
        totalRevenueLRTwstETH += BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance);
        totalFeesLRTwstETH += BigInt(event!.args.fees);
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeeslRTwstETH += BigInt(event!.args.fees);
            dailyRevenueLRTwstETH = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance);
        }
    });

    const TOKENS = {
        WETH: ADDRESSES.ethereum.WETH,
    }

    const totalFees = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const totalRevenue = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const dailyFees = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const dailyRevenue = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });

    totalFees.add(TOKENS.WETH, totalFeesWSTETH.toString());
    totalFees.add(TOKENS.WETH, totalFeesLRTwstETH.toString());

    totalRevenue.add(TOKENS.WETH, totalRevenueWETH.toString());
    totalRevenue.add(TOKENS.WETH, totalRevenueLRTwstETH.toString());

    dailyFees.add(TOKENS.WETH, dailyFeesWETH.toString());
    dailyFees.add(TOKENS.WETH, dailyFeeslRTwstETH.toString());

    dailyRevenue.add(TOKENS.WETH, dailyRevenueWSTETH.toString());
    dailyRevenue.add(TOKENS.WETH, dailyRevenueLRTwstETH.toString());

    const totalFeesNumber = Number(await totalFees.getUSDValue()).toFixed(0);
    const dailyRevenueNumber = Number(await dailyRevenue.getUSDValue()).toFixed(0);
    return {
        timestamp: timestamp,
        totalFees: totalFeesNumber,
        totalRevenue: Number(await totalRevenue.getUSDValue()).toFixed(0),
        totalProtocolRevenue: totalFeesNumber,
        totalUserFees: totalFeesNumber,
        dailyFees: Number(await dailyFees.getUSDValue()).toFixed(0),
        dailyProtocolRevenue: dailyRevenueNumber,
        dailyRevenue: dailyRevenueNumber,
    };
}

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: data,
            start: 1696611600,
            meta: {
                methodology
            }
        }
    }
}

export default adapter;
