import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";

// Parcl fees adapter
// Based on addresses from https://docs.parcl.co/addresses
// This adapter tracks fees collected by the Parcl protocol including:
// - Liquidation and settlement fees collected by authorized keepers
// - Trading fees collected by treasury addresses
// - Protocol fees collected by Parcl programs
// Note: Fee structure may need updates as more information becomes available

const AUTHORIZED_KEEPERS = [
  '6dDCUve96a1Cqw3Zv34wfbCGwU77UEPe13953UdanTnT', // Liquidator
  '2USsSXPfLcvyFNB2HcsFkkuJ2s2GkHmKZjnZXx6usp93', // Settler
];

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
  // Combine all fee collection addresses
  const allFeeAddresses = [
    ...AUTHORIZED_KEEPERS,
    ...TREASURY_ADDRESSES,
    ...PROGRAM_ADDRESSES
  ];

  // Use getSolanaReceivedDune to track all inflows to fee addresses
  const dailyFees = await getSolanaReceivedDune({
    options,
    targets: allFeeAddresses,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees, // All revenue goes to protocol
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
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Trading fees, liquidation fees, and settlement fees collected by Parcl protocol",
    Revenue: "Fees collected by authorized keepers and protocol treasury addresses",
    ProtocolRevenue: "100% of collected fees go to the protocol treasury",
  },
};

export default adapter;
