import { CHAIN } from "../../helpers/chains";
import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// Veil (veilit.xyz): a zero-knowledge shielded pool on Solana.
const PROGRAM = 'FmsMbXrQXr1mARn45Cm52sdrwAWHDxqF8473t6woq9DP';
// The program emits an Anchor event for every fee it charges:
//   ProtocolFee { mint: Pubkey, kind: u8, amount: u64 }, discriminator sha256("event:ProtocolFee")[..8].
// Bytes: 1-8 discriminator, 9-40 mint, 41 kind, 42-49 amount (little-endian).
const PROTOCOL_FEE = '0x984f2ee57f5cc015';

// 20% of Veil's revenue buys $VEIL on the market and burns it, from this wallet (USDC -> SOL -> VEIL on Jupiter, then
// a Token-2022 burn). Holders revenue is the $VEIL this wallet burns.
const VEIL = 'HgTGdc29D5bDMrDvsCLnorxz899VyDj7ZN7FPa6vpump';
const BUYBACK_WALLET = 'BdSCX5fSdrq5xJ8qjmVPt1Nus9bWtuM5tNP2dYfpfehu';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const BURN_KIND = 100;

// kind -> label. Kind 5 (tokens someone sent to a Flow DCA escrow, swept into the vault when it closes) is not a fee
// a user paid, so it is not counted.
const KINDS: Record<number, string> = {
  0: 'Shield Fees',
  1: 'Withdrawal Fees',
  2: 'Private Swap Fees',
  3: 'Relayer Fee Share',
  4: 'Flow DCA Fees',
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    WITH ev AS (
      SELECT from_base64(substr(l.msg, 15)) AS d
      FROM solana.transactions t
      CROSS JOIN UNNEST(t.log_messages) AS l(msg)
      WHERE contains(t.account_keys, '${PROGRAM}')
        AND t.success
        AND l.msg LIKE 'Program data: %'
        AND TIME_RANGE
    )
    SELECT
      to_base58(bytearray_substring(d, 9, 32)) AS mint,
      CAST(bytearray_to_uint256(bytearray_substring(d, 41, 1)) AS integer) AS kind,
      SUM(CAST(bytearray_to_uint256(reverse(bytearray_substring(d, 42, 8))) AS double)) AS amount
    FROM ev
    WHERE bytearray_length(d) >= 49 AND bytearray_substring(d, 1, 8) = ${PROTOCOL_FEE}
    GROUP BY 1, 2
    UNION ALL
    -- Token-2022 Burn (8) / BurnChecked (15): accounts [token account, mint, authority], u64 amount after the tag
    SELECT '${VEIL}' AS mint, ${BURN_KIND} AS kind,
      SUM(CAST(bytearray_to_uint256(reverse(bytearray_substring(data, 2, 8))) AS double)) AS amount
    FROM solana.instruction_calls
    WHERE executing_account = '${TOKEN_2022}'
      AND bytearray_substring(data, 1, 1) IN (0x08, 0x0f)
      AND account_arguments[2] = '${VEIL}'
      AND account_arguments[3] = '${BUYBACK_WALLET}'
      AND tx_success
      AND TIME_RANGE
  `, { extraUIDKey: 'veil-fees' });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const row of options.preFetchedResults || []) {
    if (Number(row.kind) === BURN_KIND) {
      if (row.amount) dailyHoldersRevenue.add(VEIL, row.amount, 'Token Buy Back');
      continue;
    }
    const label = KINDS[Number(row.kind)];
    if (!label) continue;
    dailyFees.add(row.mint, row.amount, label);
    dailyRevenue.add(row.mint, row.amount, `${label} To Treasury`);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Every protocol fee Veil's program charges, read from the ProtocolFee event it emits on chain with the exact token amount: shielding into the pool, withdrawing, private swaps, Flow DCA fills, and the protocol's share of relayer fees. Network fees the relayer pays and Jupiter's swap fees are not counted.",
  UserFees: "The full amount charged to users, which is the same as Fees.",
  Revenue: "All of it. Veil has no liquidity providers, lenders or stakers to pay, so nothing is deducted from fees. Fees accrue in each token's vault and are collected to the Veil treasury (a Squads multisig); 20% goes to $VEIL buybacks and burns.",
  HoldersRevenue: "$VEIL bought on the market and burned: 20% of Veil's revenue is swapped to $VEIL on Jupiter by the buyback wallet BdSCX5fSdrq5xJ8qjmVPt1Nus9bWtuM5tNP2dYfpfehu and burned. Counted from its on-chain burns.",
};

const breakdownMethodology = {
  Fees: {
    'Shield Fees': "The protocol fee charged when tokens are shielded into the pool.",
    'Withdrawal Fees': "The protocol fee charged when tokens leave the pool to a public address.",
    'Private Swap Fees': "The protocol fee charged on a swap made from inside the pool.",
    'Relayer Fee Share': "The protocol's share of the fee paid to the relayer that submits private transactions.",
    'Flow DCA Fees': "The protocol fee charged on each fill of a private DCA order.",
  },
  UserFees: {
    'Shield Fees': "Paid by the user shielding tokens.",
    'Withdrawal Fees': "Paid by the user withdrawing tokens.",
    'Private Swap Fees': "Paid by the user making a private swap.",
    'Relayer Fee Share': "Paid by the user as part of the relayer fee.",
    'Flow DCA Fees': "Paid by the owner of the DCA order.",
  },
  Revenue: {
    'Shield Fees To Treasury': "All shield fees go to the Veil treasury.",
    'Withdrawal Fees To Treasury': "All withdrawal fees go to the Veil treasury.",
    'Private Swap Fees To Treasury': "All private swap fees go to the Veil treasury.",
    'Relayer Fee Share To Treasury': "The protocol's share of relayer fees goes to the Veil treasury.",
    'Flow DCA Fees To Treasury': "All Flow DCA fees go to the Veil treasury.",
  },
  HoldersRevenue: {
    'Token Buy Back': "$VEIL bought on the market and burned by the buyback wallet, valued at the token's price.",
  },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  prefetch,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: { start: '2026-10-04' },
  },
  isExpensiveAdapter: true,
};

export default adapter;
