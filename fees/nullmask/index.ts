import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getSolanaReceived } from "../../helpers/token";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Encode } from "../../helpers/solana";
import ADDRESSES from "../../helpers/coreAssets.json";

// EVM: Nullmask shielded pool (proxy), same address on every chain
const POOL = "0xd64EF1417EB047ed0b54736a5a41F01178C391c6";
const ProtocolFeeCharged = "event ProtocolFeeCharged(uint8 indexed kind, bytes32 indexed ref, address indexed token, uint256 amount)";

// Solana: ZEC holder rewards received by the Nullmask team wallet for holding MASK
const TEAM_WALLET = "FrXTvkebakR2oNctgsHz1yeijmu9wTZifL3FmffJP5xJ";
const ZEC_MINT = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS";
const REWARDS_DISTRIBUTOR = "HuBMeYW3aDn8BH65fo8xxbP4oiexyup8udzKyccgi8Ga"; // StonkFun ZEC rewards distributor

// Solana: Nullmask shielded pool program (Anchor, events emitted with emit_cpi!)
const SOLANA_PROGRAM = "Ee6we6Bnbok55FzHfa8fU8td7NDwbKa1qgLehP4iH1Uj";
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
const PROTOCOL_FEE_CHARGED = "b9c92d1cb5b6292f"; // kind u8, reference [32], amount u64 (lamports)
const TOKEN_FEE_CHARGED = "d8ca51d5a79a0916"; // mint pubkey, kind u8, reference [32], amount u64
// event lengths in hex chars: 8-byte tag + 8-byte discriminator + payload
const PROTOCOL_FEE_CHARGED_LENGTH = 2 * (16 + 1 + 32 + 8);
const TOKEN_FEE_CHARGED_LENGTH = 2 * (16 + 32 + 1 + 32 + 8);

const HOLDER_REWARDS = "MASK Holder Rewards";
const CHECK_FEES = "Deposit Check Fees";

const fetchPool = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // kind 0 = deposit (0.5%), kind 1 = withdrawal (0.5%). Relayer gas compensation is not a protocol fee and is not emitted here.
  const logs = await options.getLogs({ target: POOL, eventAbi: ProtocolFeeCharged });
  logs.forEach((log: any) => dailyFees.add(log.token, log.amount, METRIC.DEPOSIT_WITHDRAW_FEES));
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

// Protocol fees of the Solana pool: ProtocolFeeCharged (SOL) and TokenFeeCharged (SPL / Token-2022) events.
// kind 0 = deposit fee, 1 = withdrawal fee, 2 = check fee. Relayer fees (relay_fee) are not protocol fees and are not emitted here.
// Events are read from the program's self-CPIs in solana.raw.inner_instructions, so log truncation does not affect them.
const getSolanaPoolFees = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH events AS (
      SELECT SUBSTR(data_hex, 17, 16) AS event, LENGTH(data_hex) AS len, data_hex
      FROM solana.raw.inner_instructions
      WHERE program_id = '${SOLANA_PROGRAM}'
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND SUBSTR(data_hex, 17, 16) IN ('${PROTOCOL_FEE_CHARGED}', '${TOKEN_FEE_CHARGED}')
    ),
    fees AS (
      SELECT NULL AS mint, ${u8("data_hex", 16)} AS kind, ${u64("data_hex", 49)} AS amount
      FROM events WHERE event = '${PROTOCOL_FEE_CHARGED}' AND len = ${PROTOCOL_FEE_CHARGED_LENGTH}
      UNION ALL
      SELECT SUBSTR(data_hex, 33, 64), ${u8("data_hex", 48)}, ${u64("data_hex", 81)}
      FROM events WHERE event = '${TOKEN_FEE_CHARGED}' AND len = ${TOKEN_FEE_CHARGED_LENGTH}
    ),
    checks AS (
      SELECT
        (SELECT COUNT(*) FROM events
          WHERE len <> IFF(event = '${PROTOCOL_FEE_CHARGED}', ${PROTOCOL_FEE_CHARGED_LENGTH}, ${TOKEN_FEE_CHARGED_LENGTH})) AS unknown_layout,
        -- the transfers table (also read by getSolanaReceived) is built from the raw ones, so rows past the window mean both are complete
        EXISTS (SELECT 1 FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT c.unknown_layout, c.indexed, f.mint, f.kind, f.amount
    FROM checks c
    LEFT JOIN (SELECT mint, kind, SUM(amount) AS amount FROM fees GROUP BY 1, 2) f ON TRUE
  `);
  const [check] = rows;
  if (!check?.indexed) throw new Error(`nullmask: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unknown_layout) > 0) throw new Error(`nullmask: ${check.unknown_layout} fee events with an unknown layout, the program was likely upgraded`);
  return rows
    .filter((row: any) => row.kind !== null)
    .map((row: any) => ({
      mint: row.mint ? base58Encode(Buffer.from(row.mint, "hex")) : ADDRESSES.solana.SOL,
      kind: row.kind,
      amount: row.amount,
    }));
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const poolFees = await getSolanaPoolFees(options);
  poolFees.forEach((row: any) => dailyFees.add(row.mint, row.amount, row.kind === "02" ? CHECK_FEES : METRIC.DEPOSIT_WITHDRAW_FEES));

  const received = await getSolanaReceived({
    options,
    target: TEAM_WALLET,
    mints: [ZEC_MINT],
    fromAddress: REWARDS_DISTRIBUTOR,
  });
  dailyFees.addBalances(received, HOLDER_REWARDS);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchPool, start: "2026-10-01" },
    [CHAIN.BASE]: { fetch: fetchPool, start: "2026-10-07" },
    [CHAIN.BSC]: { fetch: fetchPool, start: "2026-10-12" },
    [CHAIN.ROBINHOOD]: { fetch: fetchPool, start: "2026-10-14" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-09-23" },
  },
  dependencies: [Dependencies.ALLIUM],
  pullHourly: true,
  methodology: {
    Fees: "0.5% protocol fee on shielded pool deposits and 0.5% on withdrawals (Ethereum, Base, BNB Chain, Robinhood Chain, Solana), deposit check fees on Solana, plus ZEC rewards received by the Nullmask team wallet from MASK token holder distributions (Solana).",
    Revenue: "0.5% protocol fee on shielded pool deposits and 0.5% on withdrawals (Ethereum, Base, BNB Chain, Robinhood Chain, Solana), deposit check fees on Solana, plus ZEC rewards received by the Nullmask team wallet from MASK token holder distributions (Solana).",
    ProtocolRevenue: "0.5% protocol fee on shielded pool deposits and 0.5% on withdrawals (Ethereum, Base, BNB Chain, Robinhood Chain, Solana), deposit check fees on Solana, plus ZEC rewards received by the Nullmask team wallet from MASK token holder distributions (Solana).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.5% protocol fee charged on shielded pool deposits and withdrawals (ProtocolFeeCharged events on EVM; ProtocolFeeCharged and TokenFeeCharged events of the Solana program, kind 0 and 1). Relayer gas compensation is excluded.",
      [CHECK_FEES]: "Solana: fee charged for the AML check of a deposit that is refused or cancelled (ProtocolFeeCharged and TokenFeeCharged events, kind 2).",
      [HOLDER_REWARDS]: "ZEC rewards received by the Nullmask team wallet from the StonkFun rewards distributor for holding MASK. Other ZEC transfers to the wallet are excluded.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "All shielded pool protocol fees.",
      [HOLDER_REWARDS]: "All ZEC rewards received by the team wallet.",
      [CHECK_FEES]: "All deposit check fees.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "All shielded pool protocol fees.",
      [HOLDER_REWARDS]: "All ZEC rewards received by the team wallet.",
      [CHECK_FEES]: "All deposit check fees.",
    },
  },
};

export default adapter;
