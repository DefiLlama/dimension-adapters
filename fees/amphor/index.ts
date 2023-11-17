import { BigNumber, ethers, EventFilter } from 'ethers';

import { Adapter } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";

//const provider = ethers.getDefaultProvider();
const provider = new ethers.providers.JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/asCdyJAmlMZemONLR6gSPbY6C9HSEDv3");

const contractAddress: string = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';

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

const contract: ethers.Contract = new ethers.Contract(contractAddress, contractAbi, provider);

const methodology = {
    UserFees: "Include performance fees",
    Fees: "Includes all treasury revenue",
    Revenue: "Sum of protocol revenue",
}

const fees = async () => {
    const eventFilter: EventFilter = {
        address: contractAddress,
        topics: [ethers.utils.id('EpochEnd(uint256,uint256,uint256,uint256,uint256)')]
    };
    const events: ethers.Event[] = await contract.queryFilter(eventFilter);
    let totalFees: BigNumber = ethers.BigNumber.from(0);
    events.forEach(event => {
        totalFees = totalFees.add(event.args![3]);
    });
    totalFees = totalFees.div(1e6); // usdc has 6 decimals
    return {
        timestamp: new Date().getTime(),
        totalFees: totalFees.toString(),
        totalRevenue: totalFees.toString(),
        totalProtocolRevenue: totalFees.toString(),
        totalUserFees: totalFees.toString(),
    };
}

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: fees,
            start: async () => 1696146210,
            meta: {
                methodology
            }
        }
    }
}

export default adapter;
