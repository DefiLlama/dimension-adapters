import { FetchOptions, SimpleAdapter, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// Rise (https://rise.rich) is a Solana launchpad with on-chain lending built on top
// of the Mayflower program. Buys and sells against a Rise market generate
// Mayflower swap events emitted via Anchor's emit_cpi! macro, which appear in
// `solana.instruction_calls` as self-CPI invocations of the Mayflower program
// whose `data` starts with:
//
//   bytes  0-7  : anchor self-CPI event prefix  (0xe445a52e51cb9a1d)
//   bytes  8-15 : event discriminator           (sha256("event:<Name>")[:8])
//   bytes 16... : event payload                 (Borsh-serialized)
//
// Buy/sell event payloads share the same prefix layout up through the fee
// breakdown and the quote mint:
//
//   payload offset  type        field         data offset
//     0..32         publicKey   buyer/seller         16
//    32..64         publicKey   market               48
//    64..72         u64         cashIn / cashOut     80
//    72..80         u64         minTokenOut/cashOut  88
//    80..88         u64         revSplit.floor       96
//    88..96         u64         revSplit.creator    104
//    96..104        u64         revSplit.team       112
//    ...
//   224..256        publicKey   mintMain            240
const RISE_PROGRAM = "RiseZSHaLdj7pfn1tisUoSdG2i3QcVz9sQKuaRG9rar";
const MAYFLOWER   = "AVMmmRzwc2kETQNhPiFVnyu62HrgsQXTD6D7SnSfEz7v";
const START = "2026-03-01"; // Rise mainnet launch window

// 8-byte anchor self-CPI prefix concatenated with the 8-byte event discriminator,
// pre-rendered as a 16-byte hex literal for Dune VARBINARY_STARTS_WITH.
const BUY_EVT_PREFIX  = "0xe445a52e51cb9a1d688397a78fce6213"; // event: BuyWithExactCashInEvent
const SELL_EVT_PREFIX = "0xe445a52e51cb9a1d853e6b67da1a43f8"; // event: SellWithExactTokenInEvent

// Quote mints used by Rise markets. WSOL is the dominant one; USDC is also supported.
// 32-byte pubkeys as raw hex (matches Dune's `BYTEARRAY_SUBSTRING` output).
const WSOL_HEX = "0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001"; // So11111111111111111111111111111111111111112
const USDC_HEX = "0xc6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61"; // EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
const ACCEPTED_MINTS_HEX_LIST = [WSOL_HEX, USDC_HEX].join(", ");

const MINT_HEX_TO_B58: Record<string, string> = {
  [WSOL_HEX.slice(2)]: ADDRESSES.solana.SOL,
  [USDC_HEX.slice(2)]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

interface IRow {
  mint_hex: string;
  total_volume: string;
  total_fee_floor: string;
  total_fee_creator: string;
  total_fee_team: string;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume          = options.createBalances();
  const dailyFees            = options.createBalances();
  const dailyRevenue         = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue  = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const result = {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };

  let data: IRow[];
  try {
    data = await queryDuneSql(options, `
    WITH
      rise_txs AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${RISE_PROGRAM}'
          AND tx_success = TRUE
          AND block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <  from_unixtime(${options.endTimestamp})
      ),
      mayflower_events AS (
        SELECT
          data,
          CASE
            WHEN VARBINARY_STARTS_WITH(data, ${BUY_EVT_PREFIX})  THEN 'buy'
            WHEN VARBINARY_STARTS_WITH(data, ${SELL_EVT_PREFIX}) THEN 'sell'
          END AS evt
        FROM solana.instruction_calls
        WHERE executing_account = '${MAYFLOWER}'
          AND tx_success = TRUE
          AND block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <  from_unixtime(${options.endTimestamp})
          AND tx_id IN (SELECT tx_id FROM rise_txs)
          AND (
            VARBINARY_STARTS_WITH(data, ${BUY_EVT_PREFIX}) OR
            VARBINARY_STARTS_WITH(data, ${SELL_EVT_PREFIX})
          )
      ),
      parsed AS (
        SELECT
          evt,
          BYTEARRAY_SUBSTRING(data, 241, 32) AS mint_main,
          -- For BuyWithExactCashInEvent the 8 bytes at offset 64 are cashIn (volume in quote)
          -- For SellWithExactTokenInEvent the 8 bytes at offset 72 are cashOut (volume in quote)
          CASE WHEN evt = 'buy'
            THEN BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 81, 8)))
            ELSE BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 89, 8)))
          END AS volume,
          BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data,  97, 8))) AS fee_floor,
          BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 105, 8))) AS fee_creator,
          BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 113, 8))) AS fee_team
        FROM mayflower_events
        WHERE evt IS NOT NULL
      )
    SELECT
      LOWER(TO_HEX(mint_main))   AS mint_hex,
      CAST(SUM(volume)      AS VARCHAR) AS total_volume,
      CAST(SUM(fee_floor)   AS VARCHAR) AS total_fee_floor,
      CAST(SUM(fee_creator) AS VARCHAR) AS total_fee_creator,
      CAST(SUM(fee_team)    AS VARCHAR) AS total_fee_team
    FROM parsed
    WHERE mint_main IN (${ACCEPTED_MINTS_HEX_LIST})
    GROUP BY mint_main
  `);
  } catch (error) {
    // Recoverable chain-specific failure: log and return zeroed balances so
    // other adapters keep going. Per repo coding guidelines.
    console.error("[rise-protocol] recoverable Solana/Dune fetch error", error);
    return result;
  }

  // u64 lamport sums grow large; keep them as BigInt all the way and only
  // stringify when handing them to the Balances helper.
  for (const row of data ?? []) {
    const mint = MINT_HEX_TO_B58[row.mint_hex];
    if (!mint) continue;
    const volume     = BigInt(row.total_volume      || "0");
    const feeFloor   = BigInt(row.total_fee_floor   || "0");
    const feeCreator = BigInt(row.total_fee_creator || "0");
    const feeTeam    = BigInt(row.total_fee_team    || "0");

    dailyVolume.add(mint, volume.toString());
    // Revenue attribution per Rise's published RevenueSplits:
    //   revSplit.team    -> Rise team        -> Protocol Fees
    //   revSplit.creator -> market creator   -> Creator Fees
    //   revSplit.floor   -> returned to the bonding-curve floor; equivalent
    //                       to a buyback that benefits remaining holders
    //                       -> Token Buy Back
    dailyFees.add(mint, feeTeam.toString(),    METRIC.PROTOCOL_FEES);
    dailyFees.add(mint, feeCreator.toString(), METRIC.CREATOR_FEES);
    dailyFees.add(mint, feeFloor.toString(),   METRIC.TOKEN_BUY_BACK);

    dailyProtocolRevenue.add(mint, feeTeam.toString(),     METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(mint,  feeFloor.toString(),    METRIC.TOKEN_BUY_BACK);
    dailySupplySideRevenue.add(mint, feeCreator.toString(), METRIC.CREATOR_FEES);
    // dailyRevenue = dailyFees - dailySupplySideRevenue = team + floor
    dailyRevenue.add(mint, feeTeam.toString(),  METRIC.PROTOCOL_FEES);
    dailyRevenue.add(mint, feeFloor.toString(), METRIC.TOKEN_BUY_BACK);
  }

  return result;
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: START,
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Sum of cashIn (buy) and cashOut (sell) amounts from Mayflower BuyWithExactCashIn and SellWithExactTokenIn events emitted on Rise market trades, denominated in the market's quote token (WSOL or USDC).",
    Fees:
      "Total swap fee per trade = revSplit.floor + revSplit.creator + revSplit.team, parsed from each event's RevenueSplits payload.",
    Revenue:
      "Fees retained by the Rise ecosystem: revSplit.team (Rise team) plus revSplit.floor (returned to the bonding curve floor and accrues to remaining holders). Equals dailyFees - dailySupplySideRevenue.",
    ProtocolRevenue:
      "revSplit.team portion of swap fees, paid to the Rise team.",
    HoldersRevenue:
      "revSplit.floor portion of swap fees, deposited into the bonding curve to raise the floor and benefit remaining holders.",
    SupplySideRevenue:
      "revSplit.creator portion of swap fees, paid to the market creator.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]:  "revSplit.team paid to the Rise team.",
      [METRIC.CREATOR_FEES]:   "revSplit.creator paid to the market creator.",
      [METRIC.TOKEN_BUY_BACK]: "revSplit.floor deposited into the bonding curve floor; benefits remaining holders.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]:  "revSplit.team retained by the Rise team.",
      [METRIC.TOKEN_BUY_BACK]: "revSplit.floor returned to the bonding curve floor.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]:  "revSplit.team paid to the Rise team.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "revSplit.floor deposited into the bonding curve floor.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]:   "revSplit.creator paid to the market creator.",
    },
  },
};

export default adapter;
