/**
 * Genius Protocol — Fees / Revenue Adapter
 *
 * All inflows to the protocol multisig wallets are reported as fees and revenue.
 *
 * EVM multisig  : 0x03D7D9CAf7498f524d17F5e863c12b88F546BaAD
 * Solana multisig: 37LTs1U4ycmtUQLCgoiiNb5WG4ph8rb54WSZvRsYwyUx
 */

import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, getSolanaReceived } from "../../helpers/token";

const EVM_MULTISIG = "0x03D7D9CAf7498f524d17F5e863c12b88F546BaAD";
const SOL_MULTISIG = "37LTs1U4ycmtUQLCgoiiNb5WG4ph8rb54WSZvRsYwyUx";

const fetchEVM = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await addTokensReceived({ options, target: EVM_MULTISIG, balances: dailyFees });

  if (options.chain !== CHAIN.HYPERLIQUID)
    await getETHReceived({ options, balances: dailyFees, target: EVM_MULTISIG });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await getSolanaReceived({ options, balances: dailyFees, target: SOL_MULTISIG });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const EVM_CHAINS = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.ARBITRUM,
  CHAIN.OPTIMISM,
  CHAIN.BASE,
  CHAIN.SONIC,
  CHAIN.HYPERLIQUID,
];

const evmAdapter = Object.fromEntries(
  EVM_CHAINS.map((chain) => [
    chain,
    { fetch: fetchEVM },
  ])
);


const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All ERC-20 token and native coin inflows to the Genius Protocol multisig wallet on each chain.",
    Revenue: "All inflows are protocol revenue (100% of fees accrue to the protocol).",
  },
  start: '2026-01-01',
  adapter: {
    ...evmAdapter,
    [CHAIN.SOLANA]: { fetch: fetchSolana },
  },
  isExpensiveAdapter: true,
};

export default adapter;
