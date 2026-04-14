import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const KGEN_FEE_RATE = 0.005;

const polygonContracts = {
  b2bContract: "0x1Fcfa7866Eb4361E322aFbcBcB426B27a29d90Bd",
  marketplaceContract: "0x9Df4C994d8d8c440d87da8BA94D355BB85706f51",
};

const fetchPolygon = async (_a: any, _b: any, options: FetchOptions) => {
  const orderVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const orderPlacedLogs = await options.getLogs({
    target: polygonContracts.b2bContract,
    eventAbi: "event OrderPlaced(string orderId, string dpId, string productId, string purchaseUtr, string purchaseDate, uint256 quantity, uint256 amount, address customer)",
  });

  for (const log of orderPlacedLogs) {
    orderVolume.addUSDValue(Number(log.amount) / 1e6);
  }

  const itemSoldLogs = await options.getLogs({
    target: polygonContracts.marketplaceContract,
    eventAbi: "event ItemSoldV1(uint256 tokenId, uint256 quantity, uint256 totalPrice)",
  });

  for (const log of itemSoldLogs) {
    orderVolume.addUSDValue(Number(log.totalPrice) / 1e6);
  }

  const transferLogs = await options.getLogs({
    target: polygonContracts.marketplaceContract,
    eventAbi: "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  });

  for (const log of transferLogs) {
    orderVolume.addUSDValue(Number(log.value) / 1e6);
  }

  dailyFees.addBalances(orderVolume.clone(KGEN_FEE_RATE), METRIC.SERVICE_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const fetchAptos = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
  WITH aptos_rev AS (
    SELECT
      CAST(json_extract(data, '$.amount') AS double) / 1e6 AS volume
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
  SELECT COALESCE(SUM(volume), 0) AS volume FROM aptos_rev
  `;
  const data = await queryDuneSql(options, query);
  const volume = data[0]?.volume || 0;

  const dailyFees = options.createBalances();

  dailyFees.addUSDValue(volume * KGEN_FEE_RATE, METRIC.SERVICE_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "KGeN charges a 0.5% fee on all transactions including marketplace sales, B2B orders, and service payments.",
  Revenue: "All fees collected by the protocol go to the KGeN treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "0.5% fee on all platform transactions including marketplace sales, B2B orders, loyalty program payments, and staking operations",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchPolygon,
      start: "2025-06-23",
    },
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: "2025-06-02",
    },
  },
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;
