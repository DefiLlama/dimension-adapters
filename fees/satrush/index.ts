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

// Satrush on-chain program; owner of all protocol PDAs below
// (verifiable via getAccountInfo: each account's owner is this program).
const SATRUSH_PROGRAM = "satRushGBRY2vgapeTAkoxz26vL2cYqyPi6CnBj7Tco";

// PDAs owned by the Satrush program:
// Board account that receives miner USDC deployments and stores Sat Strike prize pool
const BOARD_PDA = "FbVd1fsYKpEj1Bzupbjo2VGJyfgLU9aw4r8U5uuR8v6s";
// Vault accumulating the Epoch prize pool
const EPOCH_VAULT_PDA = "Ei1gqB9fyR7F7JBPz49YjkAD5karR4iqxPoyYczJGk8Q";
// Vault accumulating the 1 BTC prize pool
const ONE_BTC_VAULT_PDA = "9xMBPy3aRD92QvkhYZfVwJ6ZvfLTzM84pX6ZbjBnHfGP";
// Treasury collecting the protocol fees
const TREASURY_PDA = "FP7MRz61w5HEhFa3s4ifn26A3yQGHVdvPjhqu34jfQPt";

// Share of miner deployments that stays on the board as the Sat Strike prize pool.
// Sourced from the on-chain config account 5pJUG7jjfQxQ8jmrbdpNNCZrNmqXXkppKPNMs4Twfyfc;
// any fee rate change will be preceded by a timestamp update in that account.
// Ordered most recent first; `from` is the blockTime of the config update tx.
const SAT_STRIKE_FEE_SCHEDULE = [
  // https://solscan.io/tx/VhfQdM5peym4ceKzSyTC6FGSj8sTUb2QjG7LyGVrahES3N67BGs54BwQU4oXAMDLAZgm2n16B4dVXpM4gwoUP4d
  { from: 1786633366, bps: 294 },
  // https://solscan.io/tx/4Ljdn8QsPGBUX9UJLr7o6Qkgz7NZcoPewTt3vmbtBDQRbW3posSfXT5LX8v8ax9QLG18MUaHxsFoFN3uNpqrAGrZ
  { from: 1786488229, bps: 280 },
  { from: 0, bps: 264 },
];
const BPS_DENOMINATOR = 10000;

// SQL expression resolving the Sat Strike fee BPS in effect at a transfer's
// block_timestamp, so windows straddling a rate change stay accurate.
const SAT_STRIKE_BPS_SQL = `CASE ${SAT_STRIKE_FEE_SCHEDULE.slice(0, -1)
  .map(
    ({ from, bps }) =>
      `WHEN block_timestamp >= TO_TIMESTAMP_NTZ(${from}) THEN ${bps}`
  )
  .join(" ")} ELSE ${
  SAT_STRIKE_FEE_SCHEDULE[SAT_STRIKE_FEE_SCHEDULE.length - 1].bps
} END`;

const MINER_DEPLOYMENTS = "Miner deployments";
const SAT_STRIKE_FEES = "Mining fees to Sat Strike";
const EPOCH_VAULT_FEES = "Mining fees to Epoch Vault";
const ONE_BTC_VAULT_FEES = "Mining fees to 1 BTC Vault";
const PROTOCOL_FEES = "Mining fees to Protocol";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const vaultPdas = [
    BOARD_PDA,
    EPOCH_VAULT_PDA,
    ONE_BTC_VAULT_PDA,
    TREASURY_PDA,
  ];
  const vaultPdaList = vaultPdas.map((a) => `'${a}'`).join(", ");

  // Miners deploy USDC to the board; the board later forwards the epoch,
  // 1 BTC and protocol fee cuts to their vaults, so board inflows are
  // counted only when they come from outside the tracked accounts.
  // The outer_program_id filter keeps only transfers executed by Satrush
  // program instructions, ignoring direct/arbitrary transfers into the PDAs.
  const rows: {
    to_address: string;
    amount: number;
    strike_fee_amount: number;
  }[] = await queryAllium(`
    SELECT
      to_address,
      SUM(raw_amount) AS amount,
      SUM(raw_amount * (${SAT_STRIKE_BPS_SQL})) / ${BPS_DENOMINATOR} AS strike_fee_amount
    FROM solana.assets.transfers
    WHERE mint = '${USDC_MINT}'
      AND (
        block_timestamp >=
        TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp <
        TO_TIMESTAMP_NTZ(${options.endTimestamp})
      )
      AND to_address IN (${vaultPdaList})
      AND outer_program_id = '${SATRUSH_PROGRAM}'
    GROUP BY to_address
  `);

  const inflows: Record<string, number> = {};
  const strikeFeesByAddress: Record<string, number> = {};
  rows.forEach((row) => {
    inflows[row.to_address] = Number(row.amount) || 0;
    strikeFeesByAddress[row.to_address] = Number(row.strike_fee_amount) || 0;
  });

  const boardInflow = inflows[BOARD_PDA] ?? 0;
  const strikeFees = strikeFeesByAddress[BOARD_PDA] ?? 0;
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
  dependencies: [Dependencies.ALLIUM],
  start: "2026-08-02",
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
};

export default adapter;