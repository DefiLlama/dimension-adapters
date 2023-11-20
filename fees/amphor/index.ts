import { Chain, getProvider } from "@defillama/sdk/build/general";
import { BigNumber, ethers, EventFilter, utils } from 'ethers';

import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ETHEREUM } from "../../helpers/chains";

//const provider = ethers.getDefaultProvider();
const provider = getProvider(CHAIN.ETHEREUM);
const AmphorILHedgedUSDC_contractAddress: string = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
const AmphorILHedgedWSTETH_contractAddress: string = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';

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

const AmphorILHedgedUSDC_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedUSDC_contractAddress, contractAbi, provider);
const AmphorILHedgedWSTETH_contract: ethers.Contract = new ethers.Contract(AmphorILHedgedWSTETH_contractAddress, contractAbi, provider);

const methodology = {
    UserFees: "Include performance fees.",
    Fees: "Includes all treasury revenue.",
    ProtocolRevenue: "Share of revenue going to Amphor treasury.",
    Revenue: "Sum of protocol revenue.",
}

const data = async () => {
    const eventFilterUSDC: EventFilter = {
        address: AmphorILHedgedUSDC_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventFilterWSTETH: EventFilter = {
        address: AmphorILHedgedUSDC_contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const eventsUSDC: ethers.Event[] = await AmphorILHedgedUSDC_contract.queryFilter(eventFilterUSDC);
    const eventsWSTETH: ethers.Event[] = await AmphorILHedgedWSTETH_contract.queryFilter(eventFilterWSTETH);
    let totalRevenueUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let totalRevenueWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let totalFeesWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyFeesWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueUSDC: BigNumber = ethers.BigNumber.from(0.0);
    let dailyRevenueWSTETH: BigNumber = ethers.BigNumber.from(0.0);
    const todaysDate: Date = new Date();
    eventsUSDC.forEach(event => {
        totalRevenueUSDC = totalRevenueUSDC.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesUSDC = totalFeesUSDC.add(event.args!.fees);
        console.log(event.args!.timestamp * 1000, todaysDate.getTime());
        if (event.args!.timestamp * 1000 > todaysDate.getTime()) {
            dailyFeesUSDC = dailyFeesUSDC.add(event.args!.fees);
            dailyRevenueUSDC = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
        }
    });
    eventsWSTETH.forEach(event => {
        totalRevenueWSTETH = totalRevenueWSTETH.add(ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance)));
        totalFeesWSTETH = totalFeesWSTETH.add(event.args!.fees);
        if (event.args!.timestamp * 1000 > todaysDate.getTime()) {
            dailyFeesWSTETH = dailyFeesWSTETH.add(event.args!.fees);
            dailyRevenueWSTETH = ethers.BigNumber.from(event.args!.returnedAssets).sub(ethers.BigNumber.from(event.args!.lastSavedBalance));
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
    return {
        timestamp: todaysDate.getTime(),
        totalFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
        },
        totalRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalRevenueWSTETHStr,
        },
        totalProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
        },
        totalUserFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": totalFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": totalFeesWSTETHStr,
        },
        dailyFees: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyFeesUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyFeesWSTETHStr,
        },
        dailyProtocolRevenue: {
            "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": dailyRevenueUSDCStr,
            "ethereum:0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0": dailyRevenueWSTETHStr,
        },
    };
}

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: data,
            start: async () => 1696146210,
            meta: {
                methodology
            }
        }
    }
}

export default adapter;
