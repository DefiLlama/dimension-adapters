import * as sdk from "@defillama/sdk";
import { getProvider } from "@defillama/sdk/build/general";
import { BigNumber, ethers, EventFilter } from 'ethers';

import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";

const provider = getProvider(CHAIN.ETHEREUM);
const AmphorILHedgedUSDC_contractAddress: string = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
const AmphorILHedgedWSTETH_contractAddress: string = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';
const AmphorILHedgedWBTC_contractAddress: string = '0xC4A324fDF8a2495776B4d6cA46599B5a52f96489';

const contractAbi: ethers.ContractInterface = [
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
];

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
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterWSTETH: EventFilter = {
        address: AmphorILHedgedWSTETH_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterWBTC: EventFilter = {
        address: AmphorILHedgedWBTC_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };

    const eventsUSDC: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorILHedgedUSDC_contractAddress,
        topic: '',
        topics: eventFilterUSDC.topics as string[],
        fromBlock: 18299242,
        toBlock: toBlock,
        keys: [],
        chain: CHAIN.ETHEREUM,
    })).output as ethers.Event[];

    const eventsWSTETH: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorILHedgedWSTETH_contractAddress,
        topic: '',
        topics: eventFilterWSTETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        keys: [],
        chain: CHAIN.ETHEREUM,
    })).output as ethers.Event[];

    const eventsWBTC: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorILHedgedWBTC_contractAddress,
        topic: '',
        topics: eventFilterWBTC.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        keys: [],
        chain: CHAIN.ETHEREUM,
    })).output as ethers.Event[];

    let totalRevenueUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let totalRevenueWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalRevenueWBTC: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesWBTC: BigNumber = ethers.BigNumber.from(0.0);

    let dailyFeesUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesWBTC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueWBTC: BigNumber = ethers.BigNumber.from(0.0);


    eventsUSDC.forEach(res => {
        const event = AmphorILHedgedUSDC_contract.interface.parseLog(res);
        totalRevenueUSDC = totalRevenueUSDC.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesUSDC = totalFeesUSDC.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesUSDC = dailyFeesUSDC.add(event.args!.fees);
            dailyRevenueUSDC = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    eventsWSTETH.forEach(res => {
        const event = AmphorILHedgedWSTETH_contract.interface.parseLog(res);
        totalRevenueWSTETH = totalRevenueWSTETH.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesWSTETH = totalFeesWSTETH.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesWSTETH = dailyFeesWSTETH.add(event.args!.fees);
            dailyRevenueWSTETH = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    eventsWBTC.forEach(res => {
        const event = AmphorILHedgedWBTC_contract.interface.parseLog(res);
        totalRevenueWBTC = totalRevenueWBTC.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesWBTC = totalFeesWBTC.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesWBTC = dailyFeesWBTC.add(event.args!.fees);
            dailyRevenueWBTC = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    const totalFeesUSDCStr = ethers.utils.formatUnits(totalFeesUSDC, 6); // usdc has 6 decimals
    const totalRevenueUSDCStr = ethers.utils.formatUnits(totalRevenueUSDC, 6); // usdc has 6 decimals
    const dailyFeesUSDCStr = ethers.utils.formatUnits(dailyFeesUSDC, 6); // usdc has 6 decimals
    const dailyRevenueUSDCStr = ethers.utils.formatUnits(dailyRevenueUSDC, 6); // usdc has 6 decimals
    const totalFeesWSTETHStr = ethers.utils.formatUnits(totalFeesWSTETH, 18); // wseth has 18 decimals
    const totalRevenueWSTETHStr = ethers.utils.formatUnits(totalRevenueWSTETH, 18); // wseth has 18 decimals
    const dailyFeesWSTETHStr = ethers.utils.formatUnits(dailyFeesWSTETH, 18); // wseth has 18 decimals
    const dailyRevenueWSTETHStr = ethers.utils.formatUnits(dailyRevenueWSTETH, 18); // wseth has 18 decimals
    const totalFeesWBTCStr = ethers.utils.formatUnits(totalFeesWSTETH, 8); // wbtc has 8 decimals
    const totalRevenueWBTCStr = ethers.utils.formatUnits(totalRevenueWSTETH, 8); // wbtc has 8 decimals
    const dailyFeesWBTCStr = ethers.utils.formatUnits(dailyFeesWSTETH, 8); // wbtc has 8 decimals
    const dailyRevenueWBTCStr = ethers.utils.formatUnits(dailyRevenueWSTETH, 8); // wbtc has 8 decimals
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
