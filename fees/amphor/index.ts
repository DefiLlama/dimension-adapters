import * as sdk from "@defillama/sdk";
import { BigNumber, ethers, EventFilter } from 'ethers';

import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";

const AmphorILHedgedUSDC_contractAddress: string = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
const AmphorILHedgedWSTETH_contractAddress: string = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';
const AmphorILHedgedWBTC_contractAddress: string = '0xC4A324fDF8a2495776B4d6cA46599B5a52f96489';
const AmphorPTezETHVault_contractAddress: string = '0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1';
const AmphorPTrsETHVault_contractAddress: string = '0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E';
const AmphorPTweETHVault_contractAddress: string = '0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966';

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
const AmphorPTezETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTezETHVault_contractAddress, contractAbi);
const AmphorPTrsETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTrsETHVault_contractAddress, contractAbi);
const AmphorPTweETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTweETHVault_contractAddress, contractAbi);

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
    const eventFilterPTezETH: EventFilter = {
        address: AmphorPTezETHVault_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterPTrsETH: EventFilter = {
        address: AmphorPTrsETHVault_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterPTweETH: EventFilter = {
        address: AmphorPTweETHVault_contractAddress,
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

    const eventsPTezETH: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorPTezETHVault_contractAddress,
        topic: '',
        topics: eventFilterPTezETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        keys: [],
        chain: CHAIN.ETHEREUM,
    })).output as ethers.Event[];

    const eventsPTrsETH: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorPTrsETHVault_contractAddress,
        topic: '',
        topics: eventFilterPTrsETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        keys: [],
        chain: CHAIN.ETHEREUM,
    })).output as ethers.Event[];

    const eventsPTweETH: ethers.Event[] = (await sdk.api.util.getLogs({
        target: AmphorPTweETHVault_contractAddress,
        topic: '',
        topics: eventFilterPTweETH.topics as string[],
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
    let totalRevenuePTezETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesPTezETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalRevenuePTrsETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesPTrsETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalRevenuePTweETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesPTweETH: BigNumber = ethers.BigNumber.from(0.0);

    let dailyFeesUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesWBTC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesPTezETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesPTrsETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesPTweETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueWBTC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenuePTezETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenuePTrsETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenuePTweETH: BigNumber = ethers.BigNumber.from(0.0);


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

    eventsPTezETH.forEach(res => {
        const event = AmphorPTezETHVault_contract.interface.parseLog(res);
        totalRevenuePTezETH = totalRevenuePTezETH.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesPTezETH = totalFeesPTezETH.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesPTezETH = dailyFeesPTezETH.add(event.args!.fees);
            dailyRevenuePTezETH = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    eventsPTrsETH.forEach(res => {
        const event = AmphorPTrsETHVault_contract.interface.parseLog(res);
        totalRevenuePTrsETH = totalRevenuePTrsETH.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesPTrsETH = totalFeesPTrsETH.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesPTrsETH = dailyFeesPTrsETH.add(event.args!.fees);
            dailyRevenuePTrsETH = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    eventsPTweETH.forEach(res => {
        const event = AmphorPTweETHVault_contract.interface.parseLog(res);
        totalRevenuePTweETH = totalRevenuePTweETH.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesPTweETH = totalFeesPTweETH.add(event.args!.fees);
        if (event.args!.timestamp > fromTimestamp && event.args!.timestamp < toTimestamp) {
            dailyFeesPTweETH = dailyFeesPTweETH.add(event.args!.fees);
            dailyRevenuePTweETH = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });

    const totalFeesUSDCStr = ethers.utils.formatUnits(totalFeesUSDC, 6); // usdc has 6 decimals
    const totalRevenueUSDCStr = ethers.utils.formatUnits(totalRevenueUSDC, 6); // usdc has 6 decimals
    const dailyFeesUSDCStr = ethers.utils.formatUnits(dailyFeesUSDC, 6); // usdc has 6 decimals
    const dailyRevenueUSDCStr = ethers.utils.formatUnits(dailyRevenueUSDC, 6); // usdc has 6 decimals
    const totalFeesWSTETHStr = ethers.utils.formatUnits(totalFeesWSTETH, 18); // wsteth has 18 decimals
    const totalRevenueWSTETHStr = ethers.utils.formatUnits(totalRevenueWSTETH, 18); // wsteth has 18 decimals
    const dailyFeesWSTETHStr = ethers.utils.formatUnits(dailyFeesWSTETH, 18); // wsteth has 18 decimals
    const dailyRevenueWSTETHStr = ethers.utils.formatUnits(dailyRevenueWSTETH, 18); // wsteth has 18 decimals
    const totalFeesWBTCStr = ethers.utils.formatUnits(totalFeesWBTC, 8); // wbtc has 8 decimals
    const totalRevenueWBTCStr = ethers.utils.formatUnits(totalRevenueWBTC, 8); // wbtc has 8 decimals
    const dailyFeesWBTCStr = ethers.utils.formatUnits(dailyFeesWBTC, 8); // wbtc has 8 decimals
    const dailyRevenueWBTCStr = ethers.utils.formatUnits(dailyRevenueWBTC, 8); // wbtc has 8 decimals
    const totalFeesPTezETHStr = ethers.utils.formatUnits(totalFeesPTezETH, 18); // PTezETH has 18 decimals
    const totalRevenuePTezETHStr = ethers.utils.formatUnits(totalRevenuePTezETH, 18); // PTezETH has 18 decimals
    const dailyFeesPTezETHStr = ethers.utils.formatUnits(dailyFeesPTezETH, 18); // PTezETH has 18 decimals
    const dailyRevenuePTezETHStr = ethers.utils.formatUnits(dailyRevenuePTezETH, 18); // PTezETH has 8 decimals
    const totalFeesPTrsETHStr = ethers.utils.formatUnits(totalFeesPTrsETH, 18); // PTrsETH has 18 decimals
    const totalRevenuePTrsETHStr = ethers.utils.formatUnits(totalRevenuePTrsETH, 18); // PTrsETH has 18 decimals
    const dailyFeesPTrsETHStr = ethers.utils.formatUnits(dailyFeesPTrsETH, 18); // PTrsETH has 18 decimals
    const dailyRevenuePTrsETHStr = ethers.utils.formatUnits(dailyRevenuePTrsETH, 18); // PTrsETH has 18 decimals
    const totalFeesPTweETHStr = ethers.utils.formatUnits(totalFeesPTweETH, 18); // PTweETH has 18 decimals
    const totalRevenuePTweETHStr = ethers.utils.formatUnits(totalRevenuePTweETH, 18); // PTweETH has 18 decimals
    const dailyFeesPTweETHStr = ethers.utils.formatUnits(dailyFeesPTweETH, 18); // PTweETH has 18 decimals
    const dailyRevenuePTweETHStr = ethers.utils.formatUnits(dailyRevenuePTweETH, 18); // PTweETH has 18 decimals
    return {
        timestamp: timestamp,
        totalFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": totalFeesPTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": totalFeesPTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": totalFeesPTweETHStr,
        },
        totalRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalRevenueWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": totalRevenuePTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": totalRevenuePTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": totalRevenuePTweETHStr,
        },
        totalProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": totalFeesPTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": totalFeesPTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": totalFeesPTweETHStr,
        },
        totalUserFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": totalFeesWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": totalFeesPTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": totalFeesPTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": totalFeesPTweETHStr,
        },
        dailyFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyFeesWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyFeesWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": dailyFeesPTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": dailyFeesPTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": dailyFeesPTweETHStr,
        },
        dailyProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyRevenueWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": dailyRevenuePTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": dailyRevenuePTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": dailyRevenuePTweETHStr,
        },
        dailyRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyRevenueWSTETHStr,
            "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": dailyRevenueWBTCStr,
            "ethereum:0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1": dailyRevenuePTezETHStr,
            "ethereum:0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E": dailyRevenuePTrsETHStr,
            "ethereum:0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966": dailyRevenuePTweETHStr,
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
