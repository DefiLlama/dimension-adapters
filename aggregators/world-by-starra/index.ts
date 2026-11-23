// World by Starra (https://starra.world): DEX aggregator for tokenized US stocks. Solana xStocks are routed via Jupiter,
// Ethereum Ondo Global Markets tokens via KyberSwap. Every swap pays a flat 0.05% fee in USDC to the World by Starra fee
// wallet (https://docs.starra.world). There are no LPs, referrers or token holders to share with, so 100% of fees is
// protocol revenue. Volume is measured from those fees:
//  - Ethereum: the KyberSwap MetaAggregationRouterV2 `Fee` event carries the full trade amount (`totalAmount`, in USDC) and
//    the fee recipients; we count events paying our fee wallet in swaps tagged with our KyberSwap client id.
//  - Solana: USDC platform fees paid to the fee wallet inside Jupiter swap instructions, divided by the 0.05% fee rate.
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_RATE = 0.0005; // 0.05% platform fee on every swap

// Ethereum fee receiver, sample swap: https://etherscan.io/tx/0xf7c0c326d4c0cbeb72ba105b1df7d141dd7013bd7c4534cd161dd07be154ca93
const ETH_FEE_RECEIVER = "0x5264b0b0228c77e3be0a6088bc0f18e1674b0ada";
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"; // KyberSwap MetaAggregationRouterV2
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";

// Solana fee wallet, sample swap: https://solscan.io/tx/5LwqChkhPpPBadz5fwZHyVVw2pJbX2Z6ErqAi3jybG9W9CsAGWbr37FVs1KwC8B531AtLEVQfHsNMrVXeApNhQhH
const SOLANA_FEE_WALLET = "2o4SXwGJZDtkcUK8FHdxiJnSSeZng64zptkg8GbdzffM";
const SOLANA_FEE_ACCOUNT = "Fo3xWmUPCUnbih1J2MHtbh98imSDNYsaGLV4fHngAtBv"; // USDC associated token account of the fee wallet
const SOLANA_USDC = ADDRESSES.solana.USDC;
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"; // Jupiter v6 aggregator program (platform fee is paid by its CPI)

const FEES_TO_PROTOCOL = "Trading Fees To Protocol";

// Jupiter's platform fee: USDC paid to the fee wallet by a transfer executed inside a Jupiter swap instruction
// (outer_program_id = Jupiter). Plain transfers (dust, address poisoning, deposits), including ones bundled into the same
// transaction as a swap, have a different outer program and are excluded.
// Throws unless the transfers table is already indexed past the end of the window, so ingestion lag is never stored as 0.
async function solanaSwapFees(options: FetchOptions): Promise<string> {
  const start = options.startTimestamp, end = options.endTimestamp;
  const rows = await queryAllium(`
    SELECT
      (SELECT SUM(raw_amount)
        FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${start})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${end})
          AND outer_program_id = '${JUPITER_PROGRAM}'
          AND to_address IN ('${SOLANA_FEE_WALLET}', '${SOLANA_FEE_ACCOUNT}')
          AND from_address NOT IN ('${SOLANA_FEE_WALLET}', '${SOLANA_FEE_ACCOUNT}')
          AND mint = '${SOLANA_USDC}') AS amount,
      (SELECT MIN(block_timestamp)
        FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${end})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${end + 900})) AS indexed_past_end
  `);
  if (!rows?.length) throw new Error("world-by-starra: empty Allium response");
  if (!rows[0].indexed_past_end) throw new Error("world-by-starra: Allium transfers are not indexed through the end of the window yet");
  return String(rows[0].amount ?? 0); // null sum = no swaps in a fully indexed window
}

// KyberSwap's router is public and the fee recipient is chosen by the caller, so a Fee event paying our wallet is only
// counted when the same router call also emits ClientData tagged with our KyberSwap client id ("Source":"worldbystarra"),
// which the World by Starra frontend sends on every route request. ClientData is the last event the router emits in a swap
// call (Fee comes before it), so each Fee belongs to the first ClientData after it in the same transaction. Sample:
// https://etherscan.io/tx/0xa19d610dd4c536e133149903acfd1d3c9644d061788f48334b63b5bcf1aa4dc6#eventlog (Fee 285, ClientData 289)
const KYBER_CLIENT_DATA_EVENT = "event ClientData(bytes clientData)";
const KYBER_SOURCE = '"Source":"worldbystarra"';

async function starraFeeEvents(options: FetchOptions) {
  const fees = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT, onlyArgs: false });
  const clientData = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_CLIENT_DATA_EVENT, onlyArgs: false });
  const callsByTx = new Map<string, { logIndex: number; ours: boolean }[]>();
  for (const log of clientData) {
    const hex = String(log.args.clientData).replace(/^0x/, "");
    const tx = log.transactionHash.toLowerCase();
    if (!callsByTx.has(tx)) callsByTx.set(tx, []);
    callsByTx.get(tx)!.push({ logIndex: Number(log.logIndex), ours: Buffer.from(hex, "hex").toString("utf8").includes(KYBER_SOURCE) });
  }
  return fees.filter((log: any) => {
    const calls = (callsByTx.get(log.transactionHash.toLowerCase()) ?? []).sort((a, b) => a.logIndex - b.logIndex);
    return calls.find((c) => c.logIndex > Number(log.logIndex))?.ours === true; // the swap call this Fee belongs to
  }).map((log: any) => log.args);
}

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.ETHEREUM]: { start: "2026-09-26" },
  [CHAIN.SOLANA]: { start: "2026-09-26" },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.ETHEREUM) {
    for (const log of await starraFeeEvents(options)) {
      const i = log.recipients.findIndex((r: string) => r.toLowerCase() === ETH_FEE_RECEIVER);
      if (i === -1) continue;
      dailyVolume.add(log.token, log.totalAmount);
      // With isBps, `amounts` holds each recipient's fee rate in bps (5 = 0.05%), not a token amount.
      const fee = log.isBps ? (BigInt(log.totalAmount) * BigInt(log.amounts[i])) / 10000n : BigInt(log.amounts[i]);
      dailyFees.add(log.token, fee, METRIC.TRADING_FEES);
    }
  } else {
    const fees = await solanaSwapFees(options);
    dailyFees.add(SOLANA_USDC, fees, METRIC.TRADING_FEES);
    dailyVolume.add(SOLANA_USDC, (BigInt(fees) * 10000n) / BigInt(FEE_RATE * 10000)); // fee / 0.05%
  }
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyFees.clone(1, FEES_TO_PROTOCOL));
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
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
    Volume: "Value of swaps made through World by Starra. Ethereum: USDC trade amount from KyberSwap router Fee events that pay the World by Starra fee wallet in swaps made through the World by Starra app. Solana: USDC platform fees paid to the fee wallet inside Jupiter swaps, divided by the 0.05% fee rate.",
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
