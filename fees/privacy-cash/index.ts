import { CHAIN } from "../../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const NATIVE = 'native';

// transact(Proof, ExtData): both are static up to fee, so it is always the word at byte 613.
const TRANSACT = '0xcffe8ce5';
const FEE_OFFSET = 613;

type EvmChain = { start: string; table: string; pools: { address: string; token: string }[] };

// All share admin() 0x44eb9939cfde7c394f1632c6890191d695f0a3ce; forks of this code do not.
const evmChains: Record<string, EvmChain> = {
  [CHAIN.ETHEREUM]: {
    start: '2026-05-11',
    table: 'ethereum',
    pools: [
      { address: '0x77A10AE3E513c2D73D73eb52212c6918C8830dd0', token: NATIVE },
      { address: '0xC88F4dF2B6EdDd6B6Bdf95A0177f50C90Fa7527f', token: ADDRESSES.ethereum.USDT },
    ],
  },
  [CHAIN.BASE]: {
    start: '2026-04-06',
    table: 'base',
    pools: [
      { address: '0x7F673790C08Ddf27c0Aa6fa9526CCC8dAaB081Ec', token: NATIVE },
      { address: '0xe91dd4AB03909f5CEb87f42B4308B222995a905b', token: ADDRESSES.base.USDC },
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-24',
    table: 'robinhood',
    pools: [
      { address: '0xec5266c9e44631e1ba22fd6377c38130c1f3b738', token: NATIVE },
    ],
  },
};

const SOLANA_START = '2025-08-06';
const SOLANA_PROGRAM = '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';
const TRANSACT_SOL = '0xd995828fdd34fc77';  // anchor discriminator
const TRANSACT_SPL = '0x9a42f4cc4ee1a397';
const WSOL = 'So11111111111111111111111111111111111111112';
// ExtData was minified here, moving fee from byte 529 to 497.
const SOLANA_MINIFY = '2025-09-01 01:00:00';

const evmLeg = (chain: string, { table, pools }: EvmChain) => `
    SELECT
      '${chain}' AS chain,
      CASE "to" ${pools.map(p => `WHEN ${p.address} THEN '${p.token}'`).join(' ')} END AS token,
      CAST(bytearray_to_uint256(bytearray_substring(data, ${FEE_OFFSET}, 32)) AS double) AS fee
    FROM ${table}.transactions
    WHERE "to" IN (${pools.map(p => p.address).join(', ')})
      AND success
      AND bytearray_substring(data, 1, 4) = ${TRANSACT}
      AND TIME_RANGE`;

// The program records the fee it charges in the instruction args. Deposits are always fee = 0.
const solanaLeg = `
    SELECT
      'solana' AS chain,
      CASE WHEN bytearray_substring(data, 1, 8) = ${TRANSACT_SOL} THEN '${WSOL}' ELSE account_arguments[8] END AS token,
      CAST(bytearray_to_uint256(reverse(bytearray_substring(data,
        CASE WHEN block_time < TIMESTAMP '${SOLANA_MINIFY}' THEN 529 ELSE 497 END, 8))) AS double) AS fee
    FROM solana.instruction_calls
    WHERE executing_account = '${SOLANA_PROGRAM}'
      AND bytearray_substring(data, 1, 8) IN (${TRANSACT_SOL}, ${TRANSACT_SPL})
      AND tx_success
      AND TIME_RANGE`;

const prefetch = async (options: FetchOptions) => {
  const legs = [solanaLeg, ...Object.entries(evmChains).map(([chain, cfg]) => evmLeg(chain, cfg))];
  return queryDuneSql(options, `
    SELECT chain, token, SUM(fee) AS fee
    FROM (${legs.join('\n    UNION ALL\n')})
    GROUP BY 1, 2
  `, { extraUIDKey: 'privacy-cash-fees' });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  for (const row of options.preFetchedResults.filter((r: any) => r.chain === options.chain)) {
    if (row.token === NATIVE) dailyFees.addGasToken(row.fee);
    else dailyFees.add(row.token, row.fee);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "The fee charged on each withdrawal from a shielded pool, taken as the exact amount the pool paid out to Privacy Cash rather than a modelled rate. The published schedule is 0.35% of the amount withdrawn plus a fixed relayer fee (0.006 SOL on Solana, 0.00025 ETH on Base, Ethereum and Robinhood Chain), and swaps and bridge transfers are charged the same way. Deposits are free. Costs a withdrawal passes through to other protocols - Jupiter swap fees and the 0.1% NEAR bridging fee - are paid to those protocols and are not counted here.",
  UserFees: "The full withdrawal fee charged to the user.",
  Revenue: "All withdrawal fees. Privacy Cash has no liquidity providers or stakers to pay, so every fee collected is revenue.",
  ProtocolRevenue: "All withdrawal fees. Every fee is paid to a wallet controlled by Privacy Cash.",
};

const adapter: Adapter = {
  version: 1,
  fetch,
  prefetch,
  methodology,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: { start: SOLANA_START },
    ...Object.fromEntries(Object.entries(evmChains).map(([chain, cfg]) => [chain, { start: cfg.start }])),
  },
  isExpensiveAdapter: true,
};

export default adapter;
