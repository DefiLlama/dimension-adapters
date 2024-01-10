import * as sdk from "@defillama/sdk";
import { ethers, EventFilter } from 'ethers';

import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";

const AmphorILHedgedUSDC_contractAddress: string = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
const AmphorILHedgedWSTETH_contractAddress: string = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';
const AmphorILHedgedWBTC_contractAddress: string = '0xC4A324fDF8a2495776B4d6cA46599B5a52f96489';

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

const AmphorILHedgedUSDC_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedUSDC_contractAddress, contractAbi);
const AmphorILHedgedWSTETH_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedWSTETH_contractAddress, contractAbi);
const AmphorILHedgedWBTC_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedWBTC_contractAddress, contractAbi);

const methodology = {
    UserFees: "Include performance fees.",
    Fees: "Includes all treasury revenue.",
    ProtocolRevenue: "Share of revenue going to Amphor treasury.",
    Revenue: "Sum of protocol revenue.",
}

interface ILog {
    address: string;
    data: string;
    transactionHash: string;
    topics: string[];
}

const data = async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toBlock = await getBlock(toTimestamp, CHAIN.ETHEREUM, {});

    const eventFilterUSDC: EventFilter = {
        address: AmphorILHedgedUSDC_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterWSTETH: EventFilter = {
        address: AmphorILHedgedWSTETH_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterWBTC: EventFilter = {
        address: AmphorILHedgedWBTC_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };

    const eventsUSDC = (await sdk.getEventLogs({
        target: AmphorILHedgedUSDC_contractAddress,
        topics: eventFilterUSDC.topics as string[],
        fromBlock: 18299242,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    }))as ethers.Log[];

    const eventsWSTETH = (await sdk.getEventLogs({
        target: AmphorILHedgedWSTETH_contractAddress,
        topics: eventFilterWSTETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    }))as ethers.Log[];

    const eventsWBTC = (await sdk.getEventLogs({
        target: AmphorILHedgedWBTC_contractAddress,
        topics: eventFilterWBTC.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    }))as ethers.Log[];

    let totalRevenueUSDC = BigInt(0);
    let totalFeesUSDC = BigInt(0);
    let totalRevenueWSTETH = BigInt(0);
    let totalFeesWSTETH = BigInt(0);
    let totalRevenueWBTC = BigInt(0);
    let totalFeesWBTC = BigInt(0);

    let dailyFeesUSDC = BigInt(0);
    let dailyFeesWSTETH = BigInt(0);
    let dailyFeesWBTC = BigInt(0);
    let dailyRevenueUSDC = BigInt(0);
    let dailyRevenueWSTETH = BigInt(0);
    let dailyRevenueWBTC = BigInt(0);


    eventsUSDC.forEach(res => {
        const event = AmphorILHedgedUSDC_contract.interface.parseLog(res as any);
        totalRevenueUSDC += BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        totalFeesUSDC += BigInt(event!.args.fees)
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeesUSDC += BigInt(event!.args.fees)
            dailyRevenueUSDC = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        }
    });

    eventsWSTETH.forEach(res => {
        const event = AmphorILHedgedWSTETH_contract.interface.parseLog(res as any);
        totalRevenueWSTETH += BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        totalFeesWSTETH += BigInt(event!.args.fees)
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeesWSTETH += BigInt(event!.args.fees)
            dailyRevenueWSTETH = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        }
    });

    eventsWBTC.forEach(res => {
        const event = AmphorILHedgedWBTC_contract.interface.parseLog(res as any);
        totalRevenueWBTC = totalRevenueWBTC + BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        totalFeesWBTC = totalFeesWBTC + BigInt(event!.args.fees)
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeesWBTC += BigInt(event!.args.fees)
            dailyRevenueWBTC = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        }
    });

    const totalFeesUSDCStr = ethers.formatUnits(totalFeesUSDC.toString(), 6); // usdc has 6 decimals
    const totalRevenueUSDCStr = ethers.formatUnits(totalRevenueUSDC.toString(), 6); // usdc has 6 decimals
    const dailyFeesUSDCStr = ethers.formatUnits(dailyFeesUSDC.toString(), 6); // usdc has 6 decimals
    const dailyRevenueUSDCStr = ethers.formatUnits(dailyRevenueUSDC.toString(), 6); // usdc has 6 decimals
    const totalFeesWSTETHStr = ethers.formatUnits(totalFeesWSTETH.toString(), 18); // wsteth has 18 decimals
    const totalRevenueWSTETHStr = ethers.formatUnits(totalRevenueWSTETH.toString(), 18); // wsteth has 18 decimals
    const dailyFeesWSTETHStr = ethers.formatUnits(dailyFeesWSTETH.toString(), 18); // wsteth has 18 decimals
    const dailyRevenueWSTETHStr = ethers.formatUnits(dailyRevenueWSTETH.toString(), 18); // wsteth has 18 decimals
    const totalFeesWBTCStr = ethers.formatUnits(totalFeesWBTC.toString(), 8); // wbtc has 8 decimals
    const totalRevenueWBTCStr = ethers.formatUnits(totalRevenueWBTC.toString(), 8); // wbtc has 8 decimals
    const dailyFeesWBTCStr = ethers.formatUnits(dailyFeesWBTC.toString(), 8); // wbtc has 8 decimals
    const dailyRevenueWBTCStr = ethers.formatUnits(dailyRevenueWBTC.toString(), 8); // wbtc has 8 decimals
    return {
        timestamp: timestamp,
        totalFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
        },
        totalRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalRevenueWBTCStr,
        },
        totalProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
        },
        totalUserFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
        },
        dailyFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyFeesWBTCStr,
        },
        dailyProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyRevenueWBTCStr,
        },
        dailyRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyRevenueWBTCStr,
        }
    };
}

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: data,
            start: async () => 1696611600,
            meta: {
                methodology
            }
        }
    }
}

export default adapter;
