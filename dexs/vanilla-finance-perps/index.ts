import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC, formatTimestampAsDate } from "../../utils/date";
import { FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { BigNumber } from "bignumber.js";
import { getLogs } from "@defillama/sdk/build/util/logs";
import { getEventLogs } from "@defillama/sdk";
import { formatEther } from "ethers";

// const SUBGRAPH_URL = "https://gateway.thegraph.com/api/subgraphs/id/29CLSreMwU72p85UPTrPw3sW9yT2RarVDxs2p8DkhnkH";

// // Define the GraphQL query to fetch order data
// const dailyVolumeQuery = gql`
//   query DailyVolumes($dayID: String!) {
//     dailyVolume(id: $dayID) {
//       totalAmount
//       timestamp
//     }
//   }
// `;


// const fetchVolume = async (options: FetchOptions): Promise<FetchResultVolume> => {

//   const dayID = `${options.startOfDay}`;

//   const result = await request(SUBGRAPH_URL, dailyVolumeQuery, {
//     dayID
//   }, {
//     'Authorization': 'Bearer 6b2f6a976e45a2d6a3fd1b8ad85c9764',
//   });

//   return {
//     dailyVolume: BigNumber(result.dailyVolume.totalAmount).div(1e18).toString(),
//     timestamp: result.dailyVolume.timestamp,
//   }
// };

// "inputs": [
//   {
//     "indexed": true,
//     "internalType": "address",
//     "name": "account",
//     "type": "address"
//   },
//   {
//     "indexed": true,
//     "internalType": "bytes32",
//     "name": "orderId",
//     "type": "bytes32"
//   },
//   {
//     "components": [
//       {
//         "internalType": "address",
//         "name": "account",
//         "type": "address"
//       },
//       {
//         "internalType": "bytes32",
//         "name": "orderId",
//         "type": "bytes32"
//       },
//       {
//         "internalType": "uint256",
//         "name": "amount",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "fee",
//         "type": "uint256"
//       },
//       {
//         "internalType": "bytes32",
//         "name": "quote_currency",
//         "type": "bytes32"
//       },
//       {
//         "internalType": "uint256",
//         "name": "delivery_type",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "position_type",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "quantity",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "delivery",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "strike_price",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "sheet",
//         "type": "uint256"
//       },
//       {
//         "internalType": "uint256",
//         "name": "created_at",
//         "type": "uint256"
//       }
//     ],
//     "indexed": false,
//     "internalType": "struct IVanillaMoneyVault.CreateOrderParams",
//     "name": "params",
//     "type": "tuple"
//   }
// ],
//   "name": "CreateOrder",
//     "type": "event"
//   },

const fetchVolume = async (options: FetchOptions): Promise<FetchResultVolume> => {
  let volume = BigInt(0)

  console.log("options", options)

  const logs = await getLogs({
    chain: "bsc",
    target: "0x994B9a6c85E89c42Ea7cC14D42afdf2eA68b72F1",
    eventAbi: 'event CreateOrder( address indexed account, bytes32 indexed orderId, tuple(address account, bytes32 orderId, uint256 amount, uint256 fee, bytes32 quote_currency, uint256 delivery_type, uint256 position_type, uint256 quantity, uint256 delivery, uint256 strike_price, uint256 sheet, uint256 created_at) params)',
    fromTimestamp: options.startTimestamp,
    toTimestamp: options.endTimestamp,
  })


  logs.forEach(log => {
    //quantity*strike_price*sheet
    const orderVolume = BigInt(log.args.params.quantity) * BigInt(log.args.params.strike_price) / BigInt(1e18) * BigInt(log.args.params.sheet)
    volume += orderVolume
  })

  return {
    dailyVolume: formatEther(volume),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: 1713849600,
    },
  },
};

export default adapter;
