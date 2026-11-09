import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql, timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Encode } from "../../helpers/solana";

// Veil (veilit.xyz): a zero-knowledge shielded pool on Solana.
const PROGRAM = 'FmsMbXrQXr1mARn45Cm52sdrwAWHDxqF8473t6woq9DP';
const PROTOCOL_FEE = { discriminator: '984F2EE57F5CC015', size: 49 };

const VEIL = 'HgTGdc29D5bDMrDvsCLnorxz899VyDj7ZN7FPa6vpump';
const BUYBACK_WALLET = 'BdSCX5fSdrq5xJ8qjmVPt1Nus9bWtuM5tNP2dYfpfehu';
const TO_TREASURY = 'Fees To Treasury';

const KINDS: Record<number, string> = {
  0: 'Shield Fees',
  1: 'Withdrawal Fees',
  2: 'Private Swap Fees',
  3: 'Relayer Fee Share',
  4: 'Flow DCA Fees',
};
const DCA_ESCROW_SWEEP = 5;

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`${programEventsSql(PROGRAM, options)},
  fees AS (
    SELECT SUBSTR(data, 17, 64) AS mint_hex, TO_NUMBER(${u8('data', 40)}, 'XX') AS kind, SUM(${u64('data', 41)}) AS amount
    FROM program_events
    WHERE STARTSWITH(data, '${PROTOCOL_FEE.discriminator}') AND LENGTH(data) = ${2 * PROTOCOL_FEE.size}
    GROUP BY 1, 2
  )
  SELECT checks.*,
    -- a ProtocolFee event with an unexpected size: its layout changed and the offsets above no longer hold
    (SELECT COUNT(*) FROM program_events
      WHERE STARTSWITH(data, '${PROTOCOL_FEE.discriminator}') AND LENGTH(data) != ${2 * PROTOCOL_FEE.size}) AS unknown_layouts,
    (SELECT SUM(raw_amount) FROM solana.assets.transfers
      WHERE ${timeFilter(options)} AND mint = '${VEIL}' AND type IN ('burn', 'burnChecked')
        AND from_address = '${BUYBACK_WALLET}')::VARCHAR AS burned,
    fees.mint_hex, fees.kind, fees.amount::VARCHAR AS amount
  FROM checks
  LEFT JOIN fees ON TRUE`);
  assertComplete(rows[0], 'veil', options);
  if (Number(rows[0].unknown_layouts) > 0)
    throw new Error(`veil: ${rows[0].unknown_layouts} ProtocolFee events with an unexpected size, their layout changed`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // a sum over no rows is absent from the response: no burn in an indexed window
  if (rows[0].burned) dailyHoldersRevenue.add(VEIL, rows[0].burned, 'Token Buy Back');

  for (const row of rows) {
    if (!row.mint_hex) continue; // no ProtocolFee event in the window
    const kind = Number(row.kind);
    if (kind === DCA_ESCROW_SWEEP) continue;
    const label = KINDS[kind];
    if (!label) throw new Error(`veil: unknown ProtocolFee kind ${kind}`);
    const mint = base58Encode(Buffer.from(row.mint_hex, 'hex'));
    dailyFees.add(mint, row.amount, label);
    dailyRevenue.add(mint, row.amount, `${label} To Treasury`);
    dailyProtocolRevenue.add(mint, row.amount, TO_TREASURY);
  }
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, TO_TREASURY);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Fees users pay Veil to shield tokens into its private pool, withdraw them, swap privately or fill a private DCA order, plus Veil's share of the relayer fee; network fees, Jupiter's swap fees and tokens swept from closed DCA escrows are not included.",
  UserFees: "Fees users pay Veil to shield tokens into its private pool, withdraw them, swap privately or fill a private DCA order, plus Veil's share of the relayer fee they pay.",
  Revenue: "All fees users pay Veil for shielding, withdrawals, private swaps and private DCA fills, plus its share of the relayer fee, all kept by Veil as it has no liquidity providers or stakers to pay.",
  ProtocolRevenue: "All fees users pay Veil, collected into the Veil treasury, minus the $VEIL the treasury buys back and burns with 20% of revenue, so it is negative on days when more is burned than earned.",
  HoldersRevenue: "$VEIL bought on the market with 20% of Veil's revenue and burned, counted from the buyback wallet's on-chain burns at the token's price.",
};

const breakdownMethodology = {
  Fees: {
    'Shield Fees': "The fee charged when tokens are shielded into Veil's private pool (0.3% of the amount in October 2026).",
    'Withdrawal Fees': "The fee charged when tokens are withdrawn from Veil's private pool to a public address (0.3% of the amount in October 2026).",
    'Private Swap Fees': "The fee charged on a swap made from inside Veil's private pool (0.3% of the input in October 2026).",
    'Relayer Fee Share': "Veil's share of the fee paid to the relayer that submits private transactions for the user.",
    'Flow DCA Fees': "The fee charged on each fill of a private DCA (Flow) order.",
  },
  UserFees: {
    'Shield Fees': "Paid by the user shielding tokens into Veil's private pool.",
    'Withdrawal Fees': "Paid by the user withdrawing tokens from Veil's private pool.",
    'Private Swap Fees': "Paid by the user making a swap from inside Veil's private pool.",
    'Relayer Fee Share': "Paid by the user as part of the relayer fee.",
    'Flow DCA Fees': "Paid by the owner of the private DCA order on each fill.",
  },
  Revenue: {
    'Shield Fees To Treasury': "All shield fees, collected into the Veil treasury.",
    'Withdrawal Fees To Treasury': "All withdrawal fees, collected into the Veil treasury.",
    'Private Swap Fees To Treasury': "All private swap fees, collected into the Veil treasury.",
    'Relayer Fee Share To Treasury': "Veil's share of relayer fees, collected into the Veil treasury.",
    'Flow DCA Fees To Treasury': "All private DCA fees, collected into the Veil treasury.",
  },
  ProtocolRevenue: {
    [TO_TREASURY]: "All fees collected into the Veil treasury, a Squads multisig, minus the $VEIL bought back and burned with 20% of revenue.",
  },
  HoldersRevenue: {
    'Token Buy Back': "$VEIL bought on the market with 20% of Veil's revenue and burned by the buyback wallet, valued at the token's price.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-10-04',
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  // $VEIL is bought back and burned in batches out of revenue accrued over earlier days, so ProtocolRevenue is negative
  // on days when more is burned than earned
  allowNegativeValue: true,
};

export default adapter;
