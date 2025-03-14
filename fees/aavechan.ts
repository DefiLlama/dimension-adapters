import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Superfluid contract for AaveChan stream
const SUPERFLUID_CONTRACT = "0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c";
const STREAM_ID = 100034;

const ABI = {
  getStream: {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "streamId",
            "type": "uint256"
        }
    ],
    "name": "getStream",
    "outputs": [
        {
            "internalType": "address",
            "name": "sender",
            "type": "address"
        },
        {
            "internalType": "address",
            "name": "recipient",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "deposit",
            "type": "uint256"
        },
        {
            "internalType": "address",
            "name": "tokenAddress",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "startTime",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "stopTime",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "remainingBalance",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "ratePerSecond",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
}
}

const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  // Get stream data from Superfluid contract for stream ID 100034
  const stream = await options.toApi.call({
    abi: ABI.getStream,
    target: SUPERFLUID_CONTRACT,
    params: [STREAM_ID]
  });

  // Calculate daily fees based on ratePerSecond (31709791983764586 wei/second)
  const ratePerSecond = stream.ratePerSecond;
  const SECONDS_PER_DAY = 86400;
  const dailyRate = ratePerSecond * SECONDS_PER_DAY;

  // Add fees using the stream's token address
  dailyFees.add(stream.tokenAddress, dailyRate);

  return { 
    dailyFees,
    dailyRevenue: dailyFees
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: "2023-01-01", 
    }
  },
  version: 2,
}

export default adapter;
