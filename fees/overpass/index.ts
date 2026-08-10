import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const START_DATE = "2026-05-04";
const OVERPASS_PROGRAM = "WRAPdXmxrH37RKUbH1QMnYrKdNe8w4Kz44t1cXmYeum";

const DISCRIMINATORS = {
  depositKvault: "0x9ea814a4479b1ca3",
  withdrawKvault: "0xe069dff4c5fa413e",
  depositKlend: "0x63d56424eba48742",
  withdrawKlend: "0x9aa60652ddc0c59e",
  depositSave: "0xe476531db1f30878",
  withdrawSave: "0x3c22094d0c774269",
  depositLulo: "0xe717297ce20c4aef",
  withdrawLulo: "0xf4a6eb1b92f27923",
  depositMarginfi: "0x6707d77bb2f4b9a3",
  withdrawMarginfi: "0xd5858d5df23af085",
};

const DEPOSIT_DISCRIMINATORS = [
  DISCRIMINATORS.depositKvault,
  DISCRIMINATORS.depositKlend,
  DISCRIMINATORS.depositSave,
  DISCRIMINATORS.depositLulo,
  DISCRIMINATORS.depositMarginfi,
].join(", ");

const WITHDRAW_DISCRIMINATORS = [
  DISCRIMINATORS.withdrawKvault,
  DISCRIMINATORS.withdrawKlend,
  DISCRIMINATORS.withdrawSave,
  DISCRIMINATORS.withdrawLulo,
  DISCRIMINATORS.withdrawMarginfi,
].join(", ");

const ALL_SWAP_DISCRIMINATORS = [
  DEPOSIT_DISCRIMINATORS,
  WITHDRAW_DISCRIMINATORS,
].join(", ");

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const rows = await queryDuneSql(options, `
    WITH overpass_swaps AS (
      SELECT
        tx_id,
        outer_instruction_index,
        CASE
          WHEN bytearray_substring(data, 1, 8) IN (${DEPOSIT_DISCRIMINATORS}) THEN 'deposit'
          ELSE 'withdraw'
        END AS direction,
        account_arguments[1] AS user_address,
        account_arguments[6] AS underlying_mint,
        CASE
          WHEN bytearray_substring(data, 1, 8) IN (${DISCRIMINATORS.depositMarginfi}, ${DISCRIMINATORS.withdrawMarginfi})
            THEN account_arguments[8]
          ELSE account_arguments[9]
        END AS user_underlying_ata
      FROM solana.instruction_calls
      WHERE executing_account = '${OVERPASS_PROGRAM}'
        AND bytearray_substring(data, 1, 8) IN (${ALL_SWAP_DISCRIMINATORS})
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND tx_success = true
    ),
    user_underlying_transfers AS (
      SELECT
        s.direction,
        t.amount_usd
      FROM overpass_swaps s
      INNER JOIN tokens_solana.transfers t
        ON t.tx_id = s.tx_id
        AND t.outer_instruction_index = s.outer_instruction_index
        AND t.token_mint_address = s.underlying_mint
      WHERE t.amount_usd > 0
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
        AND (
          (s.direction = 'deposit' AND (
            t.from_token_account = s.user_underlying_ata
            OR t.from_owner = s.user_address
          ))
          OR
          (s.direction = 'withdraw' AND (
            t.to_token_account = s.user_underlying_ata
            OR t.to_owner = s.user_address
          ))
        )
    )
    SELECT
      COALESCE(SUM(amount_usd), 0) AS volume_usd
    FROM user_underlying_transfers
  `);

  const volumeUsd = Number(rows[0]?.volume_usd || 0);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volumeUsd);

  return {
    dailyFees: 0,
    dailySupplySideRevenue: 0,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyVolume,
  };
};

const methodology = {
  Fees: "Zero until Overpass activates a protocol-retained fee share.",
  SupplySideRevenue: "Zero until Overpass activates a protocol-retained fee share.",
  Revenue: "Zero until Overpass activates a protocol-retained fee share.",
  ProtocolRevenue: "Zero until Overpass activates a protocol-retained fee share.",
  Volume: "Successful Overpass deposit and withdrawal flow volume, tracked on-chain from user underlying-token transfers in Overpass program transactions and priced in USD by Dune.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: START_DATE,
  methodology,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
