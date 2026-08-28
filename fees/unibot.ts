import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const V2_ROUTER = '0x27b9c20f64920eb7fbf64491423a54df9594188c';
const V1_ROUTER = '0x3999d2c5207c06bbc5cf8a6bea52966cabb76d41';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const UNIBOT_TOKEN = '0xf819d9cb1c2a819fd991781a822de3ca8607c3c9';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyTokenTaxes = options.createBalances();

  // native ETH transfers (including internal ones) split into the three
  // buckets the old ethereum.traces queries tracked:
  // - v2 fees: any ETH received by the v2 router
  // - v1 flow: ETH moved between the v1 router and WETH (fee is 1% of it)
  // - token tax: any ETH sent out by the UNIBOT token contract
  const [row] = await queryAllium(`
    SELECT
      SUM(CASE WHEN to_address = '${V2_ROUTER}' THEN raw_amount ELSE 0 END) AS v2_fees,
      SUM(CASE WHEN (from_address = '${WETH}' AND to_address = '${V1_ROUTER}')
            OR (from_address = '${V1_ROUTER}' AND to_address = '${WETH}') THEN raw_amount ELSE 0 END) AS v1_flow,
      SUM(CASE WHEN from_address = '${UNIBOT_TOKEN}' THEN raw_amount ELSE 0 END) AS token_tax
    FROM ethereum.assets.native_token_transfers
    WHERE transfer_type = 'value_transfer'
      AND (
        to_address = '${V2_ROUTER}'
        OR (from_address = '${WETH}' AND to_address = '${V1_ROUTER}')
        OR (from_address = '${V1_ROUTER}' AND to_address = '${WETH}')
        OR from_address = '${UNIBOT_TOKEN}'
      )
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  dailyFees.addGasToken(Number(row.v1_flow || 0) * 0.01);
  dailyFees.addGasToken(row.v2_fees || 0);
  dailyTokenTaxes.addGasToken(row.token_tax || 0);
  
  // ref https://dune.com/queries/2621049/4349967
  const totalFees = options.createBalances()
  totalFees.add(dailyFees, 'Trading Fees')
  totalFees.add(dailyTokenTaxes, 'Token Tax Fees')
  return { dailyFees: totalFees, dailyRevenue: totalFees, dailyProtocolRevenue: totalFees }

}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-05-25',
  methodology: {
    Fees: 'All trading fees paid by users.',
    Revenue: 'All trading fees paid by users.',
    ProtocolRevenue: 'All trading fees paid by users.',
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'Trading fees paid by users through Unibot.',
      'Token Tax Fees': 'Token tax fees collected by Unibot.',
    },
    Revenue: {
      'Trading Fees': 'Trading fees paid by users through Unibot.',
      'Token Tax Fees': 'Token tax fees collected by Unibot.',
    },
    ProtocolRevenue: {
      'Trading Fees': 'Trading fees paid by users through Unibot.',
      'Token Tax Fees': 'Token tax fees collected by Unibot.',
    },
  }
};

export default adapter;
