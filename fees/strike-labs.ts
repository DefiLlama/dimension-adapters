import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";

// Strike Labs: 24/7 cash-settled options venue, off-chain matching (hence off_chain, like the volume/OI listings).
// Every ~15 minutes the EpochVault on Arbitrum posts one 76-byte row per ledger position the epoch touched:
// position (20 bytes) | leaf (32) | payload (24) = int128 cash in USDC micros + uint64 withdrawal nonce.
// User rows are encrypted, but "the treasury posts in the clear, by choice: its balance is the fees collected"
// (https://docs.strikelabs.app/protocol/custody). Fees = change of the treasury's cash over the window.
const VAULT = "0xaCC67B04D713A1594B4c392eD196b557DB6bB4eF"; // EpochVault, live since 2026-11-02 (source not verified)
const TREASURY = "aa4bb80de918991b3b293fcc2b3c2d45905ef4d2"; // only clear-text position that rises every epoch; needs team confirmation
const EPOCH_DATA_POSTED = "event EpochDataPosted(uint256 indexed epoch, address indexed poster, bytes32 dataCommitment, bytes rows)";
const FIRST_EPOCH_BLOCK = 520657201; // epoch 1 rows; the ledger starts empty, so treasury cash is 0 before its first row
const ROW_HEX = 152; // 76 bytes
// the treasury row is only posted when its cash changes: hourly when busy, hours apart on quiet days
const LOOKBACK_BLOCKS = [4 * 86400, 4 * 86400 * 7]; // ~1d, ~7d of Arbitrum blocks (0.25s)

const getRows = (fromBlock: number, toBlock: number) =>
  sdk.getEventLogs({ chain: CHAIN.ARBITRUM, target: VAULT, fromBlock, toBlock, eventAbi: EPOCH_DATA_POSTED, onlyArgs: false });

// last treasury cash (USDC micros) posted in these logs
const lastTreasuryCash = (logs: any[]): bigint | undefined => {
  let cash: bigint | undefined;
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  for (const log of logs) {
    const hex = log.args.rows.slice(2);
    for (let i = 0; i < hex.length; i += ROW_HEX)
      if (hex.slice(i, i + 40) === TREASURY) cash = BigInt.asIntN(128, BigInt("0x" + hex.slice(i + 104, i + 136)));
  }
  return cash;
};

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.ARBITRUM), getBlock(options.toTimestamp, CHAIN.ARBITRUM)]);

  let opening: bigint | undefined; // treasury cash at window open
  if (fromBlock > FIRST_EPOCH_BLOCK) for (const lookback of [...LOOKBACK_BLOCKS, fromBlock - FIRST_EPOCH_BLOCK]) {
    const start = Math.max(FIRST_EPOCH_BLOCK, fromBlock - lookback);
    opening = lastTreasuryCash(await getRows(start, fromBlock - 1));
    if (opening !== undefined || start === FIRST_EPOCH_BLOCK) break;
  }
  opening ??= 0n;
  const closing = lastTreasuryCash(await getRows(fromBlock, toBlock)) ?? opening;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(closing - opening) / 1e6, "Trading And Settlement Fees");

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // each window needs the treasury's last row before it, which can be hours back; hourly pulls would repeat that scan 24x
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-11-02",
  methodology: {
    Fees: "Taker and maker fees on option premium plus the settlement fee paid by winning positions, measured as the growth of Strike's treasury balance posted on Arbitrum. Net of referral rewards paid from the treasury; excludes frontend builder fees.",
    Revenue: "All trading and settlement fees that reach Strike's treasury.",
    ProtocolRevenue: "All trading and settlement fees that reach Strike's treasury.",
  },
  breakdownMethodology: {
    Fees: { "Trading And Settlement Fees": "Taker, maker and settlement fees credited to the treasury." },
    Revenue: { "Trading And Settlement Fees": "Taker, maker and settlement fees credited to the treasury." },
    ProtocolRevenue: { "Trading And Settlement Fees": "Taker, maker and settlement fees credited to the treasury." },
  },
};

export default adapter;
