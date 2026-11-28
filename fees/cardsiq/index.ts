import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import ADDRESSES from "../../helpers/coreAssets.json";

const USDC = ADDRESSES.solana.USDC;
// receives the fee leg of each card buyback settlement
const FEE_WALLET = "8zyBnSAbfmUTEPTsdVChxfWxjDkskiZpCMKy6u6T9p4H";
// forwards Coinflow deposits to partner wallets; its transfers to the fee wallet are internal
const TREASURY = "BGx64qJyoNx9GjuPsVLPLKqLeKW9HsXd9THEZ4Wgcv37";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const [{ fee, volume }] = await queryAllium(`
    WITH transfers AS (
      SELECT txn_id, from_address, to_address, raw_amount
      FROM solana.assets.transfers
      WHERE mint = '${USDC}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    settlements AS (
      SELECT DISTINCT txn_id, from_address
      FROM transfers
      WHERE to_address = '${FEE_WALLET}' AND from_address NOT IN ('${FEE_WALLET}', '${TREASURY}')
    )
    SELECT
      SUM(IFF(t.to_address = '${FEE_WALLET}', t.raw_amount, 0)) AS fee,
      SUM(t.raw_amount) AS volume
    FROM transfers t
    JOIN settlements s ON s.txn_id = t.txn_id AND s.from_address = t.from_address
  `);

  if (fee) {
    dailyFees.add(USDC, fee, "Settlement Fees");
    dailyVolume.add(USDC, volume);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "USDC partners pay out when they buy cards back from collectors during live breaks: the collector's proceeds plus the CardsIQ fee in the same settlement. Excludes treasury funding of partners, Coinflow deposits and withdrawals, and CardsIQ's purchases for its own inventory.",
  Fees:
    "Fees partners pay to the CardsIQ fee wallet on each card buyback, in the same transaction that pays the collector. Transfers from CardsIQ's treasury to the fee wallet are excluded.",
  UserFees: "Fees partners pay to CardsIQ on each card buyback settlement.",
  Revenue: "All fees partners pay on card buyback settlements, kept by CardsIQ.",
  ProtocolRevenue: "All fees partners pay on card buyback settlements, kept by CardsIQ in its fee wallet.",
};

const breakdownMethodology = {
  Fees: {
    "Settlement Fees": "Fee paid by the partner to the CardsIQ fee wallet in the transaction that pays the collector for a card.",
  },
  UserFees: {
    "Settlement Fees": "Fee paid by the partner to CardsIQ on each card buyback.",
  },
  Revenue: {
    "Settlement Fees": "Card buyback fees kept by CardsIQ.",
  },
  ProtocolRevenue: {
    "Settlement Fees": "Card buyback fees kept by CardsIQ in its fee wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  start: "2026-07-28",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
