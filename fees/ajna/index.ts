import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {CallsParams} from "@defillama/sdk/build/types";

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
    ],
    "stateMutability": "view",
    "type": "function"
  },
  poolReservesInfo :   {
    "inputs": [
      {
        "internalType": "address",
        "name": "ajnaPool_",
        "type": "address"
      }
    ],
    "name": "poolReservesInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "reserves_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "claimableReserves_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "claimableReservesRemaining_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "auctionPrice_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timeRemaining_",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  burnInfo:   {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "burnEventEpoch_",
        "type": "uint256"
      }
    ],
    "name": "burnInfo",
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
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  currentBurnEpoch:   {
    "inputs": [],
    "name": "currentBurnEpoch",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },

}

export const fetchAjna = async (options: FetchOptions, factoryAddress : string, poolUtilsAddress: string,  reserveInfoIndex: number, reserveInfoABI: object = ABI.reserveInfo) => {
  const AJNA_TOKEN = '0x9a96ec9B57Fb64FbC60B423d1f4da7691Bd35079'
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const pools: string[] = await options.api.call({  abi: 'address[]:getDeployedPoolsList', target: factoryAddress})
  const quoteToken = await options.api.multiCall({  abi: 'address:quoteTokenAddress', calls: pools})
  const quoteTokenScale = await options.api.multiCall({  abi: 'uint:quoteTokenScale', calls: pools})
  const reserveInfoStart = await options.fromApi.multiCall({  abi: reserveInfoABI, calls: pools, permitFailure: true})
  const reserveInfoEnd = await options.toApi.multiCall({  abi: reserveInfoABI, calls: pools, permitFailure: true})
  const poolReserveInfoStart = await options.fromApi.multiCall({  abi: ABI.poolReservesInfo, calls: pools, target: poolUtilsAddress , permitFailure: true})
  const poolReserveInfoEnd = await options.toApi.multiCall({  abi: ABI.poolReservesInfo, calls: pools, target: poolUtilsAddress, permitFailure: true})

  const currentBurnEpochStart = await options.fromApi.multiCall({  abi: ABI.currentBurnEpoch, calls: pools , permitFailure: true})
  const currentBurnEpochEnd = await options.toApi.multiCall({  abi: ABI.currentBurnEpoch, calls: pools, permitFailure: true})

  const poolsWithBurn: CallsParams[] = [];
  pools.forEach((v,i) => {
    if (reserveInfoStart[i] != null && poolReserveInfoStart[i] != null && currentBurnEpochStart[i] != null) {

    const totalInterestEarnedByLenders =  reserveInfoEnd[i][reserveInfoIndex] - reserveInfoStart[i][reserveInfoIndex]
    if (totalInterestEarnedByLenders > 0 ) {
      dailySupplySideRevenue.add(quoteToken[i], totalInterestEarnedByLenders / quoteTokenScale[i])
    }

    const poolReserves = poolReserveInfoEnd[i][0] - poolReserveInfoStart[i][0];
    if (poolReserves > 0 ) {
      dailyFees.add(quoteToken[i], poolReserves / quoteTokenScale[i])
    }
      const hasBurn = currentBurnEpochEnd[i][0] - currentBurnEpochStart[i][0];
    if (hasBurn) {
      // collect all burn events to make a single multicall at the end
      poolsWithBurn.push({
        target: v,
        params: currentBurnEpochEnd[i][0]
      })
      }
    }
  })

  if (poolsWithBurn.length) {
    const poolsWithBurnBefore = poolsWithBurn.map((v) => {
      return {
        target: v.target,
        params: v.params as number - 1
      }
    })
    const burnAmountsBefore = await options.toApi.multiCall({  abi: ABI.burnInfo, calls: poolsWithBurnBefore ,permitFailure: true})
    const burnAmountsNow = await options.toApi.multiCall({  abi: ABI.burnInfo, calls: poolsWithBurn ,permitFailure: true})

    poolsWithBurn.forEach((_, i) => {
      const totalBurn = burnAmountsNow[i][2] - burnAmountsBefore[i][2]
      if (totalBurn > 0 ) {
        dailyHoldersRevenue.add(AJNA_TOKEN, totalBurn, { skipChain: true })
      }
    })
  }

  dailyFees.addBalances(dailySupplySideRevenue)
  dailyFees.addBalances(dailyHoldersRevenue)
  return {
    dailyFees,
    dailyRevenue : dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
};
const fetch = async (options: FetchOptions) => {
  const POOL_UTILS = '0x154FFf344f426F99E328bacf70f4Eb632210ecdc'
  const FACTORY = '0xe6f4d9711121e5304b30ac2aae57e3b085ad3c4d'
  return fetchAjna(options, FACTORY, POOL_UTILS, 3)
}
export default {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-07-04',
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
