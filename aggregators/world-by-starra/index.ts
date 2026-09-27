// World by Starra (https://starra.world): DEX aggregator for tokenized US stocks. Solana xStocks are routed via Jupiter,
// Ethereum Ondo Global Markets tokens via KyberSwap. Every swap pays a flat 0.05% fee in USDC to the World by Starra fee
// wallet (rate enforced in the frontend: https://docs.starra.world), so volume is measured from those fees:
//  - Ethereum: the KyberSwap MetaAggregationRouterV2 `Fee` event carries the full trade amount (`totalAmount`, in USDC) and
//    the fee recipients; we count events where our fee wallet is a recipient.
//  - Solana: USDC fees received by the fee wallet inside successful Jupiter swaps, divided by the 0.05% fee rate.
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const FEE_RATE = 0.0005; // 0.05% platform fee on every swap

// Ethereum fee receiver, sample swap: https://etherscan.io/tx/0xf7c0c326d4c0cbeb72ba105b1df7d141dd7013bd7c4534cd161dd07be154ca93
const ETH_FEE_RECEIVER = "0x5264b0b0228c77e3be0a6088bc0f18e1674b0ada";
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"; // KyberSwap MetaAggregationRouterV2
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";

// Solana fee wallet, sample swap: https://solscan.io/tx/5LwqChkhPpPBadz5fwZHyVVw2pJbX2Z6ErqAi3jybG9W9CsAGWbr37FVs1KwC8B531AtLEVQfHsNMrVXeApNhQhH
const SOLANA_FEE_WALLET = "2o4SXwGJZDtkcUK8FHdxiJnSSeZng64zptkg8GbdzffM";
const SOLANA_FEE_ACCOUNT = "Fo3xWmUPCUnbih1J2MHtbh98imSDNYsaGLV4fHngAtBv"; // USDC associated token account of the fee wallet
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"; // Jupiter v6 aggregator program (platform fee is paid by its CPI)

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
  const dailyVolume = options.createBalances();
  if (options.chain === CHAIN.ETHEREUM) {
    const logs = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT });
    for (const log of logs) {
      if (log.recipients.some((r: string) => r.toLowerCase() === ETH_FEE_RECEIVER)) dailyVolume.add(log.token, log.totalAmount);
    }
  } else {
    const fees = BigInt(await solanaSwapFees(options));
    dailyVolume.add(SOLANA_USDC, (fees * 10000n) / BigInt(FEE_RATE * 10000)); // fee / 0.05%
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // swaps are executed through Jupiter / KyberSwap, which are tracked as aggregators themselves
  methodology: {
    Volume: "Value of swaps made through World by Starra. Ethereum: USDC trade amount from KyberSwap router Fee events that pay the World by Starra fee wallet. Solana: USDC fees received by the fee wallet inside Jupiter swaps, divided by the 0.05% fee rate.",
  },
};

export default adapter;
