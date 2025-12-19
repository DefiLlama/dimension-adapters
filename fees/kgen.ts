import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from '../helpers/dune';

// interface DepositFungible {
//   amount: string;
//   token: string | null;
//   sender: string;
//   type: string;
// }

// const aptosConfig = {
//   contracts: [
//     "0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4",
//     "0x61b28909165252d7d21dbcb16572eaf13a660ad3d6d9884358894e0ea88d1e1f"
//   ]
// };

// const polygonConfig = {
//   contracts: [
//     {
//       address: "0x9Df4C994d8d8c440d87da8BA94D355BB85706f51",
//       events: [
//         {
//           abi: "event ItemSoldV1(uint256 tokenId, uint256 quantity, uint256 totalPrice)",
//           amountField: "totalPrice"
//         }
//       ]
//     },
//     {
//       address: "0x1Fcfa7866Eb4361E322aFbcBcB426B27a29d90Bd",
//       events: [
//         {
//           abi: "event OrderPlaced(string orderId, string dpId, string productId, string purchaseUtr, string purchaseDate, uint256 quantity, uint256 amount, address customer)",
//           amountField: "amount"
//         },
//         // Add more events for this contract here
//       ]
//     },
//     // Add more contracts here
//   ]
// };

// const POLYGON_USDT_ADDRESS = ADDRESSES.polygon.USDT;
// const APTOS_USDT_ADDRESS = ADDRESSES.aptos.USDC
// const PAGE_SIZE = 100;
// const APT_DECIMALS = 1e8;
// const USDC_DECIMALS = 1e6;
// const toUnixTime = (timestamp: string): number =>
//   Math.floor(Number(timestamp) / 1e6);

// const version2tsCache: Record<string, number> = {};

// async function versionToTimestamp(version: string): Promise<number> {
//   if (version2tsCache[version] !== undefined) return version2tsCache[version];
//   const block = await fetchURL(`${APTOS_RPC}/v1/blocks/by_version/${version}`);
//   const ts = block?.block_timestamp ? toUnixTime(block.block_timestamp) : 0;
//   version2tsCache[version] = ts;
//   return ts;
// }

// async function getEventData(
//   resource: any,
//   fromTimestamp: number,
//   toTimestamp: number,
//   contractAddress: string,
//   eventKeys: string[] = ["deposit_fungible", "deposit_native", "order_placed"],
// ): Promise<DepositFungible[]> {

//   const collected: DepositFungible[] = [];

//   for (const key of eventKeys) {
//     const handle = resource?.data?.[key];
//     if (!handle) continue;

//     const creationNum = handle.guid?.id?.creation_num;
//     const totalEvents = Number(handle.counter ?? 0);
//     if (!creationNum || totalEvents === 0) continue;

//     for (let seq = totalEvents - 1; seq >= 0; seq -= PAGE_SIZE) {
//       const batchStart = Math.max(seq - PAGE_SIZE + 1, 0);

//       const url = `${APTOS_RPC}/v1/accounts/${contractAddress}/events/${creationNum}?start=${batchStart}&limit=${PAGE_SIZE}`;

//       const events: any[] = await fetchURL(url);
//       if (!events?.length) break;

//       for (const e of events.reverse()) {
//         const ts = await versionToTimestamp(e.version);
//         if (ts > toTimestamp) continue;
//         if (ts < fromTimestamp) break;

//         collected.push({
//           amount: e.data.amount,
//           token: e.data?.token ?? null,
//           sender: e.data?.sender,
//           type: e.type,
//         });
//       }

//       const firstTs = await versionToTimestamp(events[0].version);
//       if (firstTs < fromTimestamp) break;
//     }
//   }

//   return collected;
// }

// const fetchAptosRevenue = async (options: FetchOptions) => {
//   const dailyFees = options.createBalances();

//   for (const contractAddress of aptosConfig.contracts) {
//     const resources = await getResources(contractAddress);

//     const revHolders = resources.filter((resource) =>
//       resource.type.includes("RevenueContractV2::RevenueEventHolder")
//       || resource.type.includes("RevenueContractV2::RevenueEventHolderV1")
//       || resource.type.includes("order_management_v1::B2bRevenueEventHolder")
//     );

//     const eventArrays = await Promise.all(
//       revHolders.map((r) =>
//         getEventData(r, options.fromTimestamp, options.toTimestamp, contractAddress)
//       )
//     );
//     for (const event of eventArrays.flat()) {
//       if (event.token) {
//         dailyFees.add(event.token, event.amount);
//       } else if (event.type = "0x61b28909165252d7d21dbcb16572eaf13a660ad3d6d9884358894e0ea88d1e1f::order_management_v1::OrderPlacedEvent") {
//         dailyFees.addUSDValue(Number(event.amount) / USDC_DECIMALS);
//       }
//       else {
//         dailyFees.addCGToken("aptos", Number(event.amount) / APT_DECIMALS);
//       }
//     }
//   }

//   return {
//     dailyFees: dailyFees,
//     dailyRevenue: dailyFees,
//     dailyProtocolRevenue: dailyFees,
//   };
// };

// const fetchPolygonRevenue: FetchV2 = async (options: FetchOptions) => {
//   const dailyFees = options.createBalances();

//   for (const contract of polygonConfig.contracts) {
//     for (const event of contract.events) {
//       const logs: any[] = await options.getLogs({
//         target: contract.address,
//         eventAbi: event.abi,
//       });
//       for (const log of logs) {
//         let amount: number = 0;
//         if (log.totalPrice) {
//           amount = Number(log.totalPrice);
//         }
//         else {
//           amount = Number(log.amount);
//         }
//         if (!isNaN(amount)) {
//           dailyFees.add(POLYGON_USDT_ADDRESS, amount);
//         }
//       }
//     }
//   }
//   return {
//     dailyFees,
//     dailyRevenue: dailyFees,
//     dailyProtocolRevenue: dailyFees,
//   };
// };

const prefetch = async (options: FetchOptions) => {
  const query = `
  WITH polygon_order_placed AS (
    SELECT amount
    FROM TABLE(
      decode_evm_event(
        abi => '{"anonymous":false,"inputs":[{"name":"orderId","type":"string","indexed":false},{"name":"dpId","type":"string","indexed":false},{"name":"productId","type":"string","indexed":false},{"name":"purchaseUtr","type":"string","indexed":false},{"name":"purchaseDate","type":"string","indexed":false},{"name":"quantity","type":"uint256","indexed":false},{"name":"amount","type":"uint256","indexed":false},{"name":"customer","type":"address","indexed":false}],"name":"OrderPlaced","type":"event"}',
        input => TABLE(
          SELECT *
          FROM polygon.logs
          WHERE topic0 = 0xd386408e18a58c096f8e53ba10c69484a8e8c64300782d5dbb83a9c0e9bea100
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time < from_unixtime(${options.endTimestamp})
        )
      )
    )
  ),
  polygon_item_sold AS (
    SELECT bytearray_to_uint256(bytearray_substring(data, 65, 32)) AS totalPrice
    FROM polygon.logs
    WHERE topic0 = 0x8dad70575b86f3c7b22dc6af88bf7113f7eee960b74785f99038266dd5ea1640
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  ),
  polygon_nft AS (
    SELECT bytearray_to_uint256(bytearray_substring(data, 97, 32)) AS totalPrice
    FROM polygon.logs
    WHERE topic0 = 0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  ),
  polygon_rev AS (
    SELECT COALESCE(SUM(amount), 0) / 1e6 AS revenue FROM polygon_order_placed
    UNION ALL
    SELECT COALESCE(SUM(totalPrice), 0) / 1e6 FROM polygon_item_sold
    UNION ALL
    SELECT COALESCE(SUM(totalPrice), 0) / 1e6 FROM polygon_nft
  ),
  aptos_rev AS (
    SELECT
      CASE
        WHEN event_type = '0x61b28909165252d7d21dbcb16572eaf13a660ad3d6d9884358894e0ea88d1e1f::order_management_v1::OrderPlacedEvent'
          THEN CAST(json_extract(data, '$.amount') AS double) / 1e6
        WHEN event_type IN (
          '0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4::RevenueContractV2::DepositNativeAsset',
          '0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4::RevenueContractV2::deposit_fungible'
        )
          THEN 4.36 * CAST(json_extract(data, '$.amount') AS double) / 1e6
        ELSE CAST(json_extract(data, '$.amount') AS double) / 1e6
      END AS revenue
    FROM aptos.events
    WHERE event_type IN (
      '0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4::RevenueContractV2::DepositNativeAsset',
      '0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4::RevenueContractV2::deposit_fungible',
      '0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4::RevenueContractV2::DepositFungibleAsset',
      '0x61b28909165252d7d21dbcb16572eaf13a660ad3d6d9884358894e0ea88d1e1f::order_management_v1::OrderPlacedEvent'
    )
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  )
  SELECT 'polygon' AS chain, SUM(revenue) AS revenue FROM polygon_rev
  UNION ALL
  SELECT 'aptos' AS chain, COALESCE(SUM(revenue), 0) AS revenue FROM aptos_rev
  `
  return await queryDuneSql(options, query);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await options.preFetchedResults || [];
  const chainRevenue = data.filter((row: any) => row.chain === options.chain);
  const totalRevenue = chainRevenue?.revenue || 0;
  const dailyFees = totalRevenue * 0.005; 

  return {
    dailyFees,                    
    dailyRevenue: totalRevenue,   
    dailyProtocolRevenue: totalRevenue, 
  };
};

const methodology = {
  Fees: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
  Revenue: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
  ProtocolRevenue: "All fees collected by KGeN.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.APTOS]: { start: "2025-06-02", },
    [CHAIN.POLYGON]: { start: "2025-06-23", },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
};

export default adapter;