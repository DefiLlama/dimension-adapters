import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Both exchanges emit the same OrderFilled. In a fill, `taker` == the exchange's
// own address only on the taker (aggregate) fill of a match; maker fills carry the
// taker's vault address there.
// CTFExchange (binary markets) / NegRiskCtfExchange (multi-outcome markets) — the
// same deployments exchange-service verifies EIP712 signatures against
// (EXCHANGE_CONTRACT_ADDRESS / EXCHANGE_CONTRACT_ADDRESS_NEG_RISK) and chain-watcher
// indexes OrderFilled from (CTF_EXCHANGE_ADDRESS / PREDICTSTREET_NEGRISK_CTF_EXCHANGE_ADDRESS).
const CTF = "0x90EA87493E208A14011EC700Ac9cbAf4d064acc0";
const NEGRISK = "0x79ACbb874dd01044FA38a89c1478E60FaAB40D00";
const EXCHANGES = [CTF, NEGRISK];
const EXCHANGE_SET = new Set(EXCHANGES.map((a) => a.toLowerCase()));

const OrderFilled =
  "event OrderFilled(uint64 seq, uint64 batchPosition, bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, uint256 remainingAfter)";

// One leg of every fill is the USDC.e collateral (assetId 0, same for binary and
// neg-risk), the other is the outcome token. Return both amounts + the outcome id.
function legs(a: any) {
  if (a.makerAssetId === 0n) return { usdc: a.makerAmountFilled as bigint, qty: a.takerAmountFilled as bigint, outcome: a.takerAssetId.toString() };
  if (a.takerAssetId === 0n) return { usdc: a.takerAmountFilled as bigint, qty: a.makerAmountFilled as bigint, outcome: a.makerAssetId.toString() };
  return null;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({ targets: EXCHANGES, eventAbi: OrderFilled, entireLog: true, parseLog: true, flatten: true });

  // Group fills into matches by (txHash, batchPosition); a match is atomic in one tx.
  const matches: Record<string, { taker: ReturnType<typeof legs>; makerOutcomes: Set<string> }> = {};
  for (const log of logs) {
    const a = log.args;
    const lg = legs(a);
    const key = `${log.transactionHash}|${a.batchPosition}`;
    const m = matches[key] || (matches[key] = { taker: null, makerOutcomes: new Set<string>() });
    if (EXCHANGE_SET.has(a.taker.toLowerCase())) {
      // Neither leg was USDC.e — an unexpected fill shape (bug or future exchange
      // upgrade). Log it: silently dropping the whole match would understate volume
      // with no trace of why.
      if (!lg) console.error(`predictstreet: unexpected OrderFilled leg shape at ${log.transactionHash}:${a.batchPosition}`);
      m.taker = lg; // taker (aggregate) fill
    } else if (lg) m.makerOutcomes.add(lg.outcome);
  }

  for (const m of Object.values(matches)) {
    if (!m.taker) continue;
    // Complementary outcomes (taker vs makers) => MINT/BURN cross: the whole pair's
    // collateral moved => count full quantity. Same outcome => normal trade => count
    // the USDC.e the taker paid (price × quantity).
    const cross = [...m.makerOutcomes].some((o) => o !== m.taker!.outcome);
    const amount = cross ? m.taker.qty : m.taker.usdc;
    // USDC.e is a $1 stablecoin on a brand-new chain DefiLlama can't auto-price.
    // Divide the bigint before converting so a very large amount can't lose
    // precision crossing Number.MAX_SAFE_INTEGER.
    dailyVolume.addCGToken("usd-coin", Number(amount / 1_000_000n) + Number(amount % 1_000_000n) / 1e6);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ADI],
  start: "2026-05-30",
  fetch,
  methodology: {
    Volume:
      "Reproduces PredictStreet's settlement volume formula on-chain from OrderFilled events on the CTFExchange and NegRiskCtfExchange. Normal trades count the USDC.e the taker paid (price × quantity); MINT/BURN crosses (complementary YES/NO buys or sells that mint/merge a full pair) count the full collateral of the pair (quantity). Only settled (on-chain) trades are counted.",
  },
};

export default adapter;
