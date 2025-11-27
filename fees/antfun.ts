import ADDRESSES from '../helpers/coreAssets.json'
// source: https://ant.fun

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { httpGet } from "../utils/fetchURL";

// API endpoint for dynamic fee addresses
const FEE_ADDRESSES_API = 'https://api2.ant.fun/api/v1/config/fee-addresses';

// Fallback addresses if API fails
const FALLBACK_FEE_ADDRESSES = [
  'DXoA7ESQY9jcSTkvqt3rzaDtdAhVp9gbAFPMrcrTFpoF',
  '4tbYi6gzbEyktazkQuexC5PZvga2NMwtjLVUcT3Cu1th',
  'G3atyMmJHhE7wY8Xer5c12tGD5ZBxPrzAWvAXa6vrba',
  'DL11UP6KeoSkXCN42fig9o4VMGhDFQhjmupDduwkXioU',
  'DBJrXX66XNXDiDuTqG9j1kGJ4z1spgZ4y8ATzi1pLmMs'
];

// Cache for fee addresses
let cachedFeeAddresses: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getFeeAddresses(): Promise<string[]> {
  const now = Date.now();

  // Return cached addresses if still valid
  if (cachedFeeAddresses && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedFeeAddresses;
  }

  try {
    const response = await httpGet(FEE_ADDRESSES_API, { timeout: 10000 });
    // Support new API format: data.sol array
    const addresses = response?.data?.sol || response?.data?.addresses || response?.addresses;

    if (Array.isArray(addresses) && addresses.length > 0) {
      cachedFeeAddresses = addresses;
      cacheTimestamp = now;
      return addresses;
    }
  } catch (error: any) {
    console.warn(`⚠️  Failed to fetch fee addresses from API: ${error.message}`);
  }

  // Fallback to hardcoded addresses
  console.log('📋 Using fallback fee addresses');
  return FALLBACK_FEE_ADDRESSES;
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Get fee addresses dynamically from API
  const feeAddresses = await getFeeAddresses();
  const addressList = feeAddresses.map(addr => `'${addr}'`).join(',\n          ');

  const query = `
    WITH
    allFeePayments AS (
      -- SOL payments
      SELECT
        tx_id,
        balance_change AS fee_token_amount,
        '${ADDRESSES.solana.SOL}' AS token_mint_address
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address in (
          ${addressList}
        )
        AND tx_success
        AND balance_change > 0

      UNION ALL

      -- USDC and USDT payments
      SELECT
        tx_id,
        amount AS fee_token_amount,
        token_mint_address
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND to_owner in (
          ${addressList}
        )
        AND token_mint_address in (
          '${ADDRESSES.solana.USDC}',
          '${ADDRESSES.solana.USDT}'
        )
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        feePayments.token_mint_address,
        MAX(fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id not in (
          ${addressList}
        )
      GROUP BY trades.tx_id, feePayments.token_mint_address
    )
    SELECT
      token_mint_address,
      SUM(fee) AS total_fees
    FROM
      botTrades
    GROUP BY
      token_mint_address
  `;

  const fees = await queryDuneSql(options, query);

  // Add all fees by token type, SDK will automatically convert to USD
  fees.forEach((row: any) => {
    if (row.total_fees > 0) {
      dailyFees.add(row.token_mint_address, row.total_fees);
    }
  });

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-01',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All trading fees (SOL, USDC, USDT) paid by users while using ant.fun trading bot.",
    Revenue: "Trading fees are collected by ant.fun protocol."
  }
};

export default adapter;
