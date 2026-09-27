// World by Starra (https://starra.world): DEX aggregator for tokenized US stocks. Every swap pays a flat 0.05% fee in USDC
// to the World by Starra fee wallet (https://docs.starra.world). There are no LPs, referrers or token holders to share
// with, so 100% of fees is protocol revenue.
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";

// Ethereum fee receiver, sample swap: https://etherscan.io/tx/0xf7c0c326d4c0cbeb72ba105b1df7d141dd7013bd7c4534cd161dd07be154ca93
const ETH_FEE_RECEIVER = "0x5264b0b0228c77e3be0a6088bc0f18e1674b0ada";
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"; // KyberSwap MetaAggregationRouterV2
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";

// Solana fee wallet, sample swap: https://solscan.io/tx/5LwqChkhPpPBadz5fwZHyVVw2pJbX2Z6ErqAi3jybG9W9CsAGWbr37FVs1KwC8B531AtLEVQfHsNMrVXeApNhQhH
const SOLANA_FEE_WALLET = "2o4SXwGJZDtkcUK8FHdxiJnSSeZng64zptkg8GbdzffM";
const SOLANA_FEE_ACCOUNT = "Fo3xWmUPCUnbih1J2MHtbh98imSDNYsaGLV4fHngAtBv"; // USDC associated token account of the fee wallet
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"; // Jupiter v6 aggregator program (platform fee is paid by its CPI)

const FEES_TO_PROTOCOL = "Trading Fees To Protocol";

// USDC that reached the fee wallet inside a successful Jupiter swap. Plain transfers (dust, address poisoning, deposits)
// never invoke Jupiter, so they are excluded. Throws if Allium has not indexed the whole window yet, so lag is never stored as 0.
async function solanaSwapFees(options: FetchOptions): Promise<string> {
  const start = options.startTimestamp, end = options.endTimestamp;
  const rows = await queryAllium(`
    WITH swap_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${JUPITER_PROGRAM}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
    ),
    fees AS (
      SELECT SUM(tr.raw_amount) AS amount
      FROM solana.assets.transfers tr
      JOIN swap_txs s ON s.txn_id = tr.txn_id
      WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND tr.block_timestamp < TO_TIMESTAMP_NTZ(${end})
        AND tr.to_address IN ('${SOLANA_FEE_WALLET}', '${SOLANA_FEE_ACCOUNT}')
        AND tr.from_address NOT IN ('${SOLANA_FEE_WALLET}', '${SOLANA_FEE_ACCOUNT}')
        AND tr.mint = '${SOLANA_USDC}'
    )
    SELECT
      (SELECT amount FROM fees) AS amount,
      (SELECT MAX(block_timestamp) FROM solana.raw.transactions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end - 600}) AND block_timestamp < TO_TIMESTAMP_NTZ(${end})) AS indexed_to
  `);
  if (!rows?.length) throw new Error("world-by-starra: empty Allium response");
  if (!rows[0].indexed_to) throw new Error("world-by-starra: Allium has not indexed Solana up to the end of the window yet");
  return String(rows[0].amount ?? 0); // null sum = no swaps in a fully indexed window
}

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2026-09-26" },
  [CHAIN.SOLANA]: { start: "2026-09-26" },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.ETHEREUM) {
    const logs = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT });
    for (const log of logs) {
      const i = log.recipients.findIndex((r: string) => r.toLowerCase() === ETH_FEE_RECEIVER);
      if (i === -1) continue;
      // With isBps, `amounts` holds each recipient's fee rate in bps (5 = 0.05%), not a token amount.
      const fee = log.isBps ? (BigInt(log.totalAmount) * BigInt(log.amounts[i])) / 10000n : BigInt(log.amounts[i]);
      dailyFees.add(log.token, fee, METRIC.TRADING_FEES);
    }
  } else {
    dailyFees.add(SOLANA_USDC, await solanaSwapFees(options), METRIC.TRADING_FEES);
  }
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyFees.clone(1, FEES_TO_PROTOCOL));
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "0.05% fee that users pay on every swap made through World by Starra, settled in USDC.",
    UserFees: "Users pay the 0.05% swap fee.",
    Revenue: "All swap fees go to the protocol.",
    ProtocolRevenue: "All swap fees go to the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRADING_FEES]: "0.05% fee on each swap routed through World by Starra, paid in USDC." },
    UserFees: { [METRIC.TRADING_FEES]: "0.05% fee on each swap routed through World by Starra, paid in USDC." },
    Revenue: { [FEES_TO_PROTOCOL]: "All swap fees are kept by the protocol." },
    ProtocolRevenue: { [FEES_TO_PROTOCOL]: "All swap fees are kept by the protocol treasury." },
  },
};

export default adapter;
