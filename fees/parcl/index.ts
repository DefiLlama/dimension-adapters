import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Parcl fees adapter
// Based on addresses from https://docs.parcl.co/addresses
// This adapter tracks fees collected by the Parcl protocol including:
// - Liquidation and settlement fees collected by authorized keepers
// - Trading fees collected by treasury addresses
// - Protocol fees collected by Parcl programs
// Note: Fee structure may need updates as more information becomes available

const PARCL_PROGRAMS = [
  '3parcLrT7WnXAcyPfkCz49oofuuf2guUKkjuFkAhZW8Y', // Parcl v3
  'PaRCLKPpkfHQfXTruT8yhEUx5oRNH8z8erBnzEerc8a', // Parcl Pyth
];

const AUTHORIZED_KEEPERS = [
  '6dDCUve96a1Cqw3Zv34wfbCGwU77UEPe13953UdanTnT', // Liquidator
  '2USsSXPfLcvyFNB2HcsFkkuJ2s2GkHmKZjnZXx6usp93', // Settler
];

const EXCHANGE_ADDRESS = '82dGS7Jt4Km8ZgwZVRsJ2V6vPXEhVdgDaMP7cqPGG1TW'; // Exchange 1 (usdc)

// Potential treasury/fee collection addresses
const TREASURY_ADDRESSES = [
  '82dGS7Jt4Km8ZgwZVRsJ2V6vPXEhVdgDaMP7cqPGG1TW', // Exchange address
  // Add more treasury addresses as they become available
];

// Program addresses for fee collection
const PROGRAM_ADDRESSES = [
  '3parcLrT7WnXAcyPfkCz49oofuuf2guUKkjuFkAhZW8Y', // Parcl v3 program
  'PaRCLKPpkfHQfXTruT8yhEUx5oRNH8z8erBnzEerc8a', // Parcl Pyth program
];

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Query fees from multiple sources
  const queries = [
    // 1. SOL fees collected by authorized keepers (liquidator and settler)
    {
      name: 'keeper_fees',
      query: `
        SELECT
          SUM(CASE WHEN balance_change > 0 THEN balance_change ELSE 0 END) / 1e9 AS total_fees
        FROM solana.account_activity
        WHERE
          address IN (${AUTHORIZED_KEEPERS.map(addr => `'${addr}'`).join(', ')})
          AND tx_success = true
          AND balance_change > 0
          AND TIME_RANGE
      `,
      token: ADDRESSES.solana.SOL,
      divisor: 1e9
    },

    // 2. SOL fees collected by treasury addresses
    {
      name: 'treasury_fees',
      query: `
        SELECT
          SUM(CASE WHEN balance_change > 0 THEN balance_change ELSE 0 END) / 1e9 AS total_fees
        FROM solana.account_activity
        WHERE
          address IN (${TREASURY_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
          AND tx_success = true
          AND balance_change > 0
          AND TIME_RANGE
      `,
      token: ADDRESSES.solana.SOL,
      divisor: 1e9
    },

    // 3. SOL fees collected by Parcl programs
    {
      name: 'program_fees',
      query: `
        SELECT
          SUM(CASE WHEN balance_change > 0 THEN balance_change ELSE 0 END) / 1e9 AS total_fees
        FROM solana.account_activity
        WHERE
          address IN (${PROGRAM_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
          AND tx_success = true
          AND balance_change > 0
          AND TIME_RANGE
      `,
      token: ADDRESSES.solana.SOL,
      divisor: 1e9
    }
  ];

  // Execute all queries
  for (const { name, query, token, divisor } of queries) {
    try {
      const results = await queryDuneSql(options, query);
      if (results.length > 0 && results[0].total_fees) {
        const feesAmount = results[0].total_fees;
        dailyFees.add(token, feesAmount * divisor);
        dailyRevenue.add(token, feesAmount * divisor);
      }
    } catch (error) {
      console.log(`Error querying Parcl ${name}:`, error);
      // Continue with other queries even if one fails
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue, // All revenue goes to protocol
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-06-01', // Parcl launched in June 2024
    },
  },
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Trading fees, liquidation fees, and settlement fees collected by Parcl protocol",
    Revenue: "Fees collected by authorized keepers and protocol treasury addresses",
    ProtocolRevenue: "100% of collected fees go to the protocol treasury",
  },
};

export default adapter;
