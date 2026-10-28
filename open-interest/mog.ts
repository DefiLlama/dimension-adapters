import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ChainApi } from "@defillama/sdk";

// mog (https://mog.xyz) treasury-backed perps on Robinhood Chain. Markets proxy is unverified;
// ABI taken from the app bundle. Position ids are per-market sequences and never reused.
const MARKETS = "0xBaF66148476F57F50f154a7f77F1AEF82Ce7F24c";
const ABI = {
  marketCount: "function marketCount() view returns (uint16)",
  sequences: "function sequences(uint16 mkt) view returns (uint64 posSeq, uint64 orderSeq, uint64 orderHead, uint32 openCount)",
  positionOf: "function positionOf(uint16 mkt, uint64 posId) view returns ((address owner, uint8 side, uint8 status, uint56 fillNonce, uint8 flags, uint16 lev, uint128 m, uint128 r, uint128 downLevel, uint128 upLevel, uint128 fillMark, uint64 hWad, uint64 dPrev, uint64 dNext, uint64 uPrev, uint64 uNext, uint64 cWad, uint128 n, uint128 mCol))",
};
const STATUS_OPEN = 1; // 2 = settled (closed, liquidated or capped)
const SIDE_LONG = 0;

const fetch = async (options: FetchOptions) => {
  // the public RPC keeps only a few seconds of historical state, so read at the latest block
  const api = new ChainApi({ chain: options.chain });
  const marketCount = Number(await api.call({ target: MARKETS, abi: ABI.marketCount }));
  const markets = Array.from({ length: marketCount }, (_, i) => i);
  const sequences = await api.multiCall({ target: MARKETS, abi: ABI.sequences, calls: markets });

  // ponytail: sweeps every position ever opened (~1k/day); walk the open-position level list if this gets slow
  const calls = markets.flatMap((mkt, i) =>
    Array.from({ length: Number(sequences[i].posSeq) }, (_, j) => ({ params: [mkt, j + 1] }))
  );
  const positions = await api.multiCall({ target: MARKETS, abi: ABI.positionOf, calls });

  const openInterestAtEnd = options.createBalances();
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();
  for (const p of positions) {
    if (Number(p.status) !== STATUS_OPEN) continue;
    const notional = Number(p.n) / 1e18; // USDG wad, notional = margin x leverage
    openInterestAtEnd.addUSDValue(notional);
    (Number(p.side) === SIDE_LONG ? longOpenInterestAtEnd : shortOpenInterestAtEnd).addUSDValue(notional);
  }

  // pool venue with no single-sided field: average the two sides instead of summing them
  openInterestAtEnd.resizeBy(0.5);
  longOpenInterestAtEnd.resizeBy(0.5);
  shortOpenInterestAtEnd.resizeBy(0.5);

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-18",
  runAtCurrTime: true,
  methodology: {
    OpenInterest: "Notional (margin x leverage, in USDG) of every open position read from the markets contract, averaged across longs and shorts because both sides face the protocol treasury rather than each other.",
  },
};

export default adapter;
