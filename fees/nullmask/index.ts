import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getSolanaReceived } from "../../helpers/token";
import { queryDuneSql } from "../../helpers/dune";
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
const EVENT_CPI_TAG = "0xe445a52e51cb9a1d";
const PROTOCOL_FEE_CHARGED = "0xb9c92d1cb5b6292f"; // kind u8, reference [32], amount u64 (lamports)
const TOKEN_FEE_CHARGED = "0xd8ca51d5a79a0916"; // mint pubkey, kind u8, reference [32], amount u64

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
const getSolanaPoolFees = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH events AS (
      SELECT data
      FROM solana.instruction_calls
      WHERE executing_account = '${SOLANA_PROGRAM}'
        AND tx_success = true
        AND varbinary_substring(data, 1, 8) = ${EVENT_CPI_TAG}
        AND varbinary_substring(data, 9, 8) IN (${PROTOCOL_FEE_CHARGED}, ${TOKEN_FEE_CHARGED})
        AND TIME_RANGE
    )
    SELECT
      CASE WHEN varbinary_substring(data, 9, 8) = ${PROTOCOL_FEE_CHARGED}
        THEN '${ADDRESSES.solana.SOL}'
        ELSE to_base58(varbinary_substring(data, 17, 32))
      END AS mint,
      bytearray_to_bigint(
        CASE WHEN varbinary_substring(data, 9, 8) = ${PROTOCOL_FEE_CHARGED}
          THEN varbinary_substring(data, 17, 1)
          ELSE varbinary_substring(data, 49, 1)
        END
      ) AS kind,
      SUM(CAST(bytearray_to_bigint(varbinary_reverse(
        CASE WHEN varbinary_substring(data, 9, 8) = ${PROTOCOL_FEE_CHARGED}
          THEN varbinary_substring(data, 50, 8)
          ELSE varbinary_substring(data, 82, 8)
        END
      )) AS DECIMAL(38, 0))) AS amount
    FROM events
    GROUP BY 1, 2
  `);
  return rows;
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const poolFees = await getSolanaPoolFees(options);
  poolFees.forEach((row: any) => dailyFees.add(row.mint, row.amount, Number(row.kind) === 2 ? CHECK_FEES : METRIC.DEPOSIT_WITHDRAW_FEES));

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
  // version 1: the Solana pool fees come from Dune, which runs once per day
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchPool, start: "2026-10-01" },
    [CHAIN.BASE]: { fetch: fetchPool, start: "2026-10-07" },
    [CHAIN.BSC]: { fetch: fetchPool, start: "2026-10-12" },
    [CHAIN.ROBINHOOD]: { fetch: fetchPool, start: "2026-10-14" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-09-23" },
  },
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
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
