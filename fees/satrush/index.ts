import ADDRESSES from "../../helpers/coreAssets.json";
import {
  Dependencies,
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const USDC_MINT = ADDRESSES.solana.USDC;

const BOARD_PDA = "FbVd1fsYKpEj1Bzupbjo2VGJyfgLU9aw4r8U5uuR8v6s";
const EPOCH_VAULT_PDA = "Ei1gqB9fyR7F7JBPz49YjkAD5karR4iqxPoyYczJGk8Q";
const ONE_BTC_VAULT_PDA = "9xMBPy3aRD92QvkhYZfVwJ6ZvfLTzM84pX6ZbjBnHfGP";
const TREASURY_PDA = "FP7MRz61w5HEhFa3s4ifn26A3yQGHVdvPjhqu34jfQPt";

// Share of miner deployments that stays on the board as the Sat Strike prize pool
const SAT_STRIKE_FEE_BPS = 264;

const SAT_STRIKE_FEES = "Mining fees to Sat Strike";
const EPOCH_VAULT_FEES = "Mining fees to Epoch Vault";
const ONE_BTC_VAULT_FEES = "Mining fees to 1 BTC Vault";
const PROTOCOL_FEES = "Mining fees to Protocol";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const vaultPdas = [EPOCH_VAULT_PDA, ONE_BTC_VAULT_PDA, TREASURY_PDA];
  const vaultPdaList = vaultPdas.map((a) => `'${a}'`).join(", ");

  // Miners deploy USDC to the board; the board later forwards the epoch,
  // 1 BTC and protocol fee cuts to their vaults, so board inflows are
  // counted only when they come from outside the tracked accounts.
  const rows: { to_address: string; amount: number }[] = await queryAllium(`
    SELECT
      to_address,
      SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE mint = '${USDC_MINT}'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND (
        (to_address = '${BOARD_PDA}' AND from_address NOT IN (${vaultPdaList}))
        OR to_address IN (${vaultPdaList})
      )
    GROUP BY to_address
  `);

  const inflows: Record<string, number> = {};
  rows.forEach((row) => {
    inflows[row.to_address] = Number(row.amount) || 0;
  });

  const boardInflow = inflows[BOARD_PDA] ?? 0;
  const strikeFees = (boardInflow * SAT_STRIKE_FEE_BPS) / 10000;
  const epochFees = inflows[EPOCH_VAULT_PDA] ?? 0;
  const oneBtcFees = inflows[ONE_BTC_VAULT_PDA] ?? 0;
  const protocolFees = inflows[TREASURY_PDA] ?? 0;

  const dailyVolume = options.createBalances();
  dailyVolume.add(USDC_MINT, boardInflow);

  const dailyFees = options.createBalances();
  dailyFees.add(USDC_MINT, strikeFees, SAT_STRIKE_FEES);
  dailyFees.add(USDC_MINT, epochFees, EPOCH_VAULT_FEES);
  dailyFees.add(USDC_MINT, oneBtcFees, ONE_BTC_VAULT_FEES);
  dailyFees.add(USDC_MINT, protocolFees, PROTOCOL_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(USDC_MINT, strikeFees, SAT_STRIKE_FEES);
  dailySupplySideRevenue.add(USDC_MINT, epochFees, EPOCH_VAULT_FEES);
  dailySupplySideRevenue.add(USDC_MINT, oneBtcFees, ONE_BTC_VAULT_FEES);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.add(USDC_MINT, protocolFees, PROTOCOL_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [SAT_STRIKE_FEES]: "Fees accumulated in the Sat Strike prize pool.",
    [EPOCH_VAULT_FEES]: "Fees accumulated in the Epoch prize pool.",
    [ONE_BTC_VAULT_FEES]: "Fees accumulated in the One BTC prize pool.",
    [PROTOCOL_FEES]: "Fees retained by the protocol.",
  },
  SupplySideRevenue: {
    [SAT_STRIKE_FEES]:
      "Share of the value deployed by miners that goes to the Sat Strike prize pool, paid out to participating miners.",
    [EPOCH_VAULT_FEES]:
      "Share of the value deployed by miners that goes to the Epoch prize pool, paid out to participating miners.",
    [ONE_BTC_VAULT_FEES]:
      "Share of the value deployed by miners that goes to the One BTC prize pool, paid out to participating miners.",
  },
  Revenue: {
    [PROTOCOL_FEES]:
      "Share of the value deployed by miners that funds protocol operations and treasury.",
  },
  ProtocolRevenue: {
    [PROTOCOL_FEES]:
      "Share of the value deployed by miners that funds protocol operations and treasury.",
  },
};

const methodology = {
  Volume: "Total value deployed by miners participating in the rounds.",
  Fees: "Fees charged on the value deployed by miners, which fund the outsized rewards pools and the protocol fee.",
  SupplySideRevenue:
    "Share of fees that fills the prize pools, paid out to miners.",
  Revenue: "Protocol fee retained by the protocol.",
  ProtocolRevenue:
    "Protocol fee that funds protocol operations and treasury reserves.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  start: "2026-08-02",
  methodology,
  breakdownMethodology,
};

export default adapter;
