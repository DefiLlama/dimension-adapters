import * as sdk from "@defillama/sdk";
import { ethers, EventFilter } from 'ethers';
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { getBlock } from "../../helpers/getBlock";

const AmphorILHedgedWETH_contractAddress: string = '0xcDC51F2B0e5F0906f2fd5f557de49D99c34Df54e';
const AmphorPTezETHVault_contractAddress: string = '0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1';
const AmphorPTrsETHVault_contractAddress: string = '0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E';
const AmphorPTweETHVault_contractAddress: string = '0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966';

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
const AmphorPTezETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTezETHVault_contractAddress, contractAbi);
const AmphorPTrsETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTrsETHVault_contractAddress, contractAbi);
const AmphorPTweETHVault_contract: ethers.Contract = new ethers.Contract(AmphorPTweETHVault_contractAddress, contractAbi);

const methodology = {
    UserFees: "Include performance fees.",
    Fees: "Includes all treasury revenue.",
    ProtocolRevenue: "Share of revenue going to Amphor treasury.",
    Revenue: "Sum of protocol revenue.",
}

const data = async ({ endTimestamp }: FetchOptions): Promise<FetchResultV2> => {
    const toTimestamp = endTimestamp;
    const fromTimestamp = endTimestamp - 60 * 60 * 24;
    const toBlock = await getBlock(toTimestamp, CHAIN.ETHEREUM, {});


    const eventFilterWETH: EventFilter = {
        address: AmphorILHedgedWETH_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };

    const eventFilterPTezETH: EventFilter = {
        address: AmphorPTezETHVault_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterPTrsETH: EventFilter = {
        address: AmphorPTrsETHVault_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterPTweETH: EventFilter = {
        address: AmphorPTweETHVault_contractAddress,
        topics: [ethers.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };



    const eventsWETH = (await sdk.getEventLogs({
        target: AmphorILHedgedWETH_contractAddress,
        topics: eventFilterWETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];





    const eventsPTezETH = (await sdk.getEventLogs({
        target: AmphorPTezETHVault_contractAddress,
        topics: eventFilterPTezETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];

    const eventsPTrsETH = (await sdk.getEventLogs({
        target: AmphorPTrsETHVault_contractAddress,
        topics: eventFilterPTrsETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];

    const eventsPTweETH = (await sdk.getEventLogs({
        target: AmphorPTweETHVault_contractAddress,
        topics: eventFilterPTweETH.topics as string[],
        fromBlock: 18535914,
        toBlock: toBlock,
        chain: CHAIN.ETHEREUM,
    })) as ethers.Log[];

    let totalRevenueWETH = BigInt(0);
    let totalFeesWSTETH = BigInt(0);
    let totalRevenuePTezETH = BigInt(0);
    let totalFeesPTezETH = BigInt(0);
    let totalRevenuePTrsETH = BigInt(0);
    let totalFeesPTrsETH = BigInt(0);
    let totalRevenuePTweETH = BigInt(0);
    let totalFeesPTweETH = BigInt(0);

    let dailyFeesWETH = BigInt(0);
    let dailyFeesPTezETH = BigInt(0);
    let dailyFeesPTrsETH = BigInt(0);
    let dailyFeesPTweETH = BigInt(0);
    let dailyRevenueWSTETH = BigInt(0);
    let dailyRevenuePTezETH = BigInt(0);
    let dailyRevenuePTrsETH = BigInt(0);
    let dailyRevenuePTweETH = BigInt(0);



    eventsWETH.forEach(res => {
        const event = AmphorILHedgedWETH_contract.interface.parseLog(res as any);
        totalRevenueWETH += BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance)
        totalFeesWSTETH += BigInt(event!.args.fees)
        if (event!.args.timestamp > fromTimestamp && event!.args.timestamp < toTimestamp) {
            dailyFeesWETH += BigInt(event!.args.fees);
            dailyRevenueWSTETH = BigInt(event!.args.returnedAssets) - BigInt(event!.args.lastSavedBalance);
        }
    });



    eventsPTezETH.forEach(res => {
        const event = AmphorPTezETHVault_contract.interface.parseLog(res as any);
        totalRevenuePTezETH += BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        totalFeesPTezETH += BigInt(event!.args!.fees);
        if (event!.args!.timestamp > fromTimestamp && event!.args!.timestamp < toTimestamp) {
            dailyFeesPTezETH += BigInt(event!.args!.fees);
            dailyRevenuePTezETH = BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        }
    });

    eventsPTrsETH.forEach(res => {
        const event = AmphorPTrsETHVault_contract.interface.parseLog(res as any);
        totalRevenuePTrsETH += BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        totalFeesPTrsETH += BigInt(event!.args!.fees);
        if (event!.args!.timestamp > fromTimestamp && event!.args!.timestamp < toTimestamp) {
            dailyFeesPTrsETH += BigInt(event!.args!.fees);
            dailyRevenuePTrsETH = BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        }
    });

    eventsPTweETH.forEach(res => {
        const event = AmphorPTweETHVault_contract.interface.parseLog(res as any);
        totalRevenuePTweETH += BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        totalFeesPTweETH += BigInt(event!.args!.fees);
        if (event!.args!.timestamp > fromTimestamp && event!.args!.timestamp < toTimestamp) {
            dailyFeesPTweETH += BigInt(event!.args!.fees);
            dailyRevenuePTweETH = BigInt(event!.args!.returnedAssets) - BigInt(event!.args!.lastSavedBalance);
        }
    });

    const TOKENS = {
        WETH: ADDRESSES.ethereum.WETH,
        PTezETH: "0xeEE8aED1957ca1545a0508AfB51b53cCA7e3c0d1",
        PTrsETH: "0xB05cABCd99cf9a73b19805edefC5f67CA5d1895E",
        PTweETH: "0xc69Ad9baB1dEE23F4605a82b3354F8E40d1E5966",
    }
    const totalFees = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const totalRevenue = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const dailyFees = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });
    const dailyRevenue = new sdk.Balances({ chain: CHAIN.ETHEREUM, timestamp: toTimestamp });

    totalFees.add(TOKENS.WETH, totalFeesWSTETH.toString());
    totalFees.add(TOKENS.PTezETH, totalFeesPTezETH.toString());
    totalFees.add(TOKENS.PTrsETH, totalFeesPTrsETH.toString());
    totalFees.add(TOKENS.PTweETH, totalFeesPTweETH.toString());

    totalRevenue.add(TOKENS.WETH, totalRevenueWETH.toString());
    totalRevenue.add(TOKENS.PTezETH, totalRevenuePTezETH.toString());
    totalRevenue.add(TOKENS.PTrsETH, totalRevenuePTrsETH.toString());
    totalRevenue.add(TOKENS.PTweETH, totalRevenuePTweETH.toString());

    dailyFees.add(TOKENS.WETH, dailyFeesWETH.toString());
    dailyFees.add(TOKENS.PTezETH, dailyFeesPTezETH.toString());
    dailyFees.add(TOKENS.PTrsETH, dailyFeesPTrsETH.toString());
    dailyFees.add(TOKENS.PTweETH, dailyFeesPTweETH.toString());

    dailyRevenue.add(TOKENS.WETH, dailyRevenueWSTETH.toString());
    dailyRevenue.add(TOKENS.PTezETH, dailyRevenuePTezETH.toString());
    dailyRevenue.add(TOKENS.PTrsETH, dailyRevenuePTrsETH.toString());
    dailyRevenue.add(TOKENS.PTweETH, dailyRevenuePTweETH.toString());


    const totalFeesNumber = Number(await totalFees.getUSDValue()).toFixed(0);
    const dailyRevenueNumber = Number(await dailyRevenue.getUSDValue()).toFixed(0);
    return {
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
    },
    version: 2
}

export default adapter;
