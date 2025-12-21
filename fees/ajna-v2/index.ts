import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {fetchAjna} from "../ajna";

const ABI = {
  reserveInfo :   {
    "inputs": [],
    "name": "reservesInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
    ],
    "stateMutability": "view",
    "type": "function"
  },
}

const fetch = async (options: FetchOptions) => {
  const POOL_UTILS = '0x30c5eF2997d6a882DE52c4ec01B6D0a5e5B4fAAE'
  const FACTORY = '0x6146DD43C5622bB6D12A5240ab9CF4de14eDC625'
  return fetchAjna(options, FACTORY, POOL_UTILS, 4, ABI.reserveInfo)
}
export default {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-04',
    }
  },
  methodology: {
    Fees: "Fees collected from borrowers, lenders, and penalties",
    Revenue: "~10-15% net interest margin + origination fees and penalties are used to burn AJNA token",
    ProtocolRevenue: "Protocol takes no direct fees",
    HoldersRevenue: "Accumulated fees in reserves are used for token burns by utilizing auctions",
    dailySupplySideRevenue: "~85-90% interest rate goes to lenders from borrowers"
  },
};
