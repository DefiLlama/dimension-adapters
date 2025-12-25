import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Parcl fees adapter
// Based on addresses from https://docs.parcl.co/addresses
// This adapter tracks fees collected by authorized keepers (liquidator and settler)
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

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Query for fees collected by authorized keepers (liquidator and settler)
  const feeAddresses = AUTHORIZED_KEEPERS;

  // Query: SOL fees collected by liquidator and settler keepers
  const feesQuery = `
    SELECT
      SUM(CASE WHEN balance_change > 0 THEN balance_change ELSE 0 END) / 1e9 AS total_fees_sol
    FROM solana.account_activity
    WHERE
      address IN (${feeAddresses.map(addr => `'${addr}'`).join(', ')})
      AND tx_success = true
      AND balance_change > 0
      AND TIME_RANGE
  `;

  try {
    // Execute fees query for authorized keepers
    const results = await queryDuneSql(options, feesQuery);
    if (results.length > 0 && results[0].total_fees_sol) {
      const feesInSol = results[0].total_fees_sol;
      dailyFees.add(ADDRESSES.solana.SOL, feesInSol);
      dailyRevenue.add(ADDRESSES.solana.SOL, feesInSol);
    }
  } catch (error) {
    console.log('Error querying Parcl fees:', error);
    // Return empty results if query fails
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
    };
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
    Fees: "Liquidation and settlement fees collected by Parcl protocol authorized keepers",
    Revenue: "Fees collected by authorized liquidator and settler accounts",
    ProtocolRevenue: "100% of collected fees go to the protocol treasury",
  },
};

export default adapter;
