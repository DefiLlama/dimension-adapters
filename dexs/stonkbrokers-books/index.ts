/**
 * StonkBrokers Books (TOKENIZE.FUN), Robinhood Chain.
 *
 * A Book is a tokenized trader: a launch pad curve sells Book tokens into the
 * trader's ERC-6551 vault, the curve bonds into a locked Uniswap v3 or v4 pool,
 * and at the end of the epoch the vault is liquidated and holders redeem.
 *
 * Pre bond (TraderBookPad):
 *   BookBuy.ethIn (gross, quote token) + BookSell.ethGross count as volume.
 *   The decaying anti snipe tax on both sides splits 7500 / 833 / 833 / rest:
 *   Book vault, creator, protocol treasury, and StockBooster on WETH books
 *   (treasury on other quotes).
 *
 * Post bond:
 *   Swaps on every locked Book pool (v3 pools from the v3 locker's Locked event,
 *   v4 pool ids from the v4 locker's Locked event) count the pool fee on the
 *   quote side as the LP fee. Their volume is not counted: it is trading on an
 *   external Uniswap pool, not on the Book curve. Locked LP fees
 *   go to Book LP stakers (or are burned) and the vault's own LP leg, so they
 *   are supply side. Locker FeesCollected / LpFees FeesHarvested are NOT read
 *   to avoid double counting.
 *
 * Close (TraderBookSettler):
 *   CloseFeeAccrued: a 2% fee on closing NAV, 1% Mancer (host) / 1% protocol.
 *
 * Every "eth" field is denominated in the Book's own quote token (BookTiming.quote).
 * Only WETH and STONKBROKER quoted books are counted.
 */
import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  ROBINHOOD_WETH,
  STONKBROKER,
  UNI_V4_POOL_MANAGER,
  UNI_V4_SWAP,
  UNI_V4_SWAP_TOPIC0,
  addQuote,
} from "../stonkbrokers/helpers";

const STACKS = [
  {
    // production
    fromBlock: 93679099,
    pad: "0xdf4bFc928F0b94916Df29E2fF736C121Da6b3B10",
    settler: "0x05116a284CeED7aeeEb552d82402d0c7953bd0fb",
    locker: "0x4155d6bc8dA56f418e5c9F712f1fcb57688Abe02",
    lockerV4: "0x4d18492A24B1DDfCCDe5777F5684939Bbc91C490",
  },
  {
    // one hour epoch stack
    fromBlock: 93679313,
    pad: "0xee0024FE9acF40565Bc62a926A0e06921C307921",
    settler: "0xB75625430bB5c5235f7538B39f5141f931C42A32",
    locker: "0xFB1d98Bf614E0796BCABCa4ed6e48D56b153E37D",
    lockerV4: "0x1a61Bb8F2e9B008774b397C146Aad84ff18F6248",
  },
];

const START_BLOCK = Math.min(...STACKS.map((s) => s.fromBlock));

const ALLOWED_QUOTES = new Set([ROBINHOOD_WETH.toLowerCase(), STONKBROKER.toLowerCase()]);

const BPS = 10_000n;
const TBA_BPS = 7_500n;
const CREATOR_BPS = 833n;
const PROTOCOL_BPS = 833n;

const LABELS = {
  Tax: "Book Anti Snipe Tax",
  CloseFee: "Book Close Fee",
  TaxVault: "Book Anti Snipe Tax To Book Vault",
  TaxCreator: "Book Anti Snipe Tax To Creator",
  TaxProtocol: "Book Anti Snipe Tax To Protocol",
  TaxBooster: "Book Anti Snipe Tax To StockBooster",
  LpFees: "Book Locked Pool LP Fees",
  CloseProtocol: "Book Close Fee To Protocol",
  CloseMancer: "Book Close Fee To Mancer",
} as const;

const EV = {
  timing:
    "event BookTiming(uint256 indexed bookId, address quote, uint8 venue, address hook, uint64 antiSnipeEndsAt, uint64 minBondAt, uint64 deadline)",
  registered: "event BookRegistered(uint256 indexed bookId, address token, address tba)",
  buy: "event BookBuy(uint256 indexed bookId, address indexed buyer, uint256 ethIn, uint256 tax, uint256 taxBps, uint256 tokensOut, uint256 mcapUsd8)",
  sell: "event BookSell(uint256 indexed bookId, address indexed seller, uint256 tokensIn, uint256 ethGross, uint256 tax, uint256 taxBps, uint256 ethOut, uint256 mcapUsd8)",
  lockedV3:
    "event Locked(uint256 indexed lockId, uint256 indexed positionId, address pool, address bookToken, uint256 bookIn, uint256 quoteIn, address feeRecipient, uint256 unlockAt)",
  lockedV4:
    "event Locked(uint256 indexed lockId, bytes32 indexed poolId, address hook, address bookToken, uint256 bookIn, uint256 quoteIn, address feeRecipient, uint256 unlockAt)",
  closeFee: "event CloseFeeAccrued(uint256 indexed bookId, uint256 mancerAmount, uint256 protocolAmount)",
  v3Swap:
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
};

const abs = (x: bigint) => (x < 0n ? -x : x);

function splitTax(tax: bigint, quote: string, fees: Balances, revenue: Balances, protocol: Balances, supply: Balances) {
  if (tax <= 0n) return;
  const toVault = (tax * TBA_BPS) / BPS;
  const toCreator = (tax * CREATOR_BPS) / BPS;
  const toProtocol = (tax * PROTOCOL_BPS) / BPS;
  const rest = tax - toVault - toCreator - toProtocol;
  const isWeth = quote === ROBINHOOD_WETH.toLowerCase();

  addQuote(fees, quote, tax, LABELS.Tax);
  addQuote(supply, quote, toVault, LABELS.TaxVault);
  addQuote(supply, quote, toCreator, LABELS.TaxCreator);
  addQuote(revenue, quote, toProtocol, LABELS.TaxProtocol);
  addQuote(protocol, quote, toProtocol, LABELS.TaxProtocol);
  if (isWeth) {
    addQuote(supply, quote, rest, LABELS.TaxBooster);
  } else {
    addQuote(revenue, quote, rest, LABELS.TaxProtocol);
    addQuote(protocol, quote, rest, LABELS.TaxProtocol);
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const history = { fromBlock: START_BLOCK, cacheInCloud: true, flatten: false };
  const [timings, registered, lockedV3, lockedV4, buys, sells, closes] = await Promise.all([
    options.getLogs({ targets: STACKS.map((s) => s.pad), eventAbi: EV.timing, ...history }),
    options.getLogs({ targets: STACKS.map((s) => s.pad), eventAbi: EV.registered, ...history }),
    options.getLogs({ targets: STACKS.map((s) => s.locker), eventAbi: EV.lockedV3, ...history }),
    options.getLogs({ targets: STACKS.map((s) => s.lockerV4), eventAbi: EV.lockedV4, ...history }),
    options.getLogs({ targets: STACKS.map((s) => s.pad), eventAbi: EV.buy, flatten: false }),
    options.getLogs({ targets: STACKS.map((s) => s.pad), eventAbi: EV.sell, flatten: false }),
    options.getLogs({ targets: STACKS.map((s) => s.settler), eventAbi: EV.closeFee, flatten: false }),
  ]);

  const v3Pools = new Map<string, string>(); // pool -> quote
  const v4Pools = new Map<string, { quote: string; book: string }>(); // pool id -> quote, Book token

  STACKS.forEach((_, i) => {
    const quoteOf = new Map<string, string>();
    for (const t of timings[i]) {
      const q = String(t.quote).toLowerCase();
      if (ALLOWED_QUOTES.has(q)) quoteOf.set(String(t.bookId), q);
    }
    const quoteOfToken = new Map<string, string>();
    for (const r of registered[i]) {
      const q = quoteOf.get(String(r.bookId));
      if (q) quoteOfToken.set(String(r.token).toLowerCase(), q);
    }

    // ---- pre bond curve trades + anti snipe tax
    for (const b of buys[i]) {
      const q = quoteOf.get(String(b.bookId));
      if (!q) continue;
      addQuote(dailyVolume, q, BigInt(b.ethIn));
      splitTax(BigInt(b.tax), q, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue);
    }
    for (const x of sells[i]) {
      const q = quoteOf.get(String(x.bookId));
      if (!q) continue;
      addQuote(dailyVolume, q, BigInt(x.ethGross));
      splitTax(BigInt(x.tax), q, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue);
    }

    // ---- close fee
    for (const c of closes[i]) {
      const q = quoteOf.get(String(c.bookId));
      if (!q) continue;
      const mancer = BigInt(c.mancerAmount);
      const prot = BigInt(c.protocolAmount);
      addQuote(dailyFees, q, mancer + prot, LABELS.CloseFee);
      addQuote(dailySupplySideRevenue, q, mancer, LABELS.CloseMancer);
      addQuote(dailyRevenue, q, prot, LABELS.CloseProtocol);
      addQuote(dailyProtocolRevenue, q, prot, LABELS.CloseProtocol);
    }

    // ---- locked pools the stack's Books bonded into
    for (const l of lockedV3[i]) {
      const q = quoteOfToken.get(String(l.bookToken).toLowerCase());
      if (q) v3Pools.set(String(l.pool).toLowerCase(), q);
    }
    for (const l of lockedV4[i]) {
      const q = quoteOfToken.get(String(l.bookToken).toLowerCase());
      const poolId = String(l.poolId).toLowerCase();
      if (q && /^0x[0-9a-f]{64}$/.test(poolId)) v4Pools.set(poolId, { quote: q, book: String(l.bookToken).toLowerCase() });
    }
  });

  // ---- post bond v3 pools
  if (v3Pools.size) {
    const pools = [...v3Pools.keys()];
    const [token0s, poolFees, swaps] = await Promise.all([
      options.api.multiCall({ abi: "address:token0", calls: pools }),
      options.api.multiCall({ abi: "uint24:fee", calls: pools }),
      options.getLogs({ targets: pools, eventAbi: EV.v3Swap, flatten: false }),
    ]);
    pools.forEach((pool, i) => {
      const q = v3Pools.get(pool)!;
      const quoteIs0 = String(token0s[i]).toLowerCase() === q;
      const fee = BigInt(poolFees[i]);
      for (const sw of swaps[i]) {
        const amt = abs(BigInt(quoteIs0 ? sw.amount0 : sw.amount1));
        const lp = (amt * fee) / 1_000_000n;
        addQuote(dailyFees, q, lp, LABELS.LpFees);
        addQuote(dailySupplySideRevenue, q, lp, LABELS.LpFees);
      }
    });
  }

  const v4 = [...v4Pools.entries()];
  const v4Swaps = await Promise.all(
    v4.map(([poolId]) =>
      options.getLogs({ target: UNI_V4_POOL_MANAGER, topics: [UNI_V4_SWAP_TOPIC0, poolId], eventAbi: UNI_V4_SWAP }),
    ),
  );
  v4.forEach(([, { quote: q, book }], i) => {
    const quoteIs0 = BigInt(q) < BigInt(book);
    for (const sw of v4Swaps[i]) {
      const amt = abs(BigInt(quoteIs0 ? sw.amount0 : sw.amount1));
      const lp = (amt * BigInt(sw.fee)) / 1_000_000n;
      addQuote(dailyFees, q, lp, LABELS.LpFees);
      addQuote(dailySupplySideRevenue, q, lp, LABELS.LpFees);
    }
  });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-10-20" },
  },
  methodology: {
    Volume:
      "Trading in Book tokens on TOKENIZE.FUN (a Book is a token backed by one trader's vault): buys and sells on each Book's launch curve, tax included. Swaps in the Uniswap v3 or v4 pool a Book moves to once it bonds are excluded. Only Books priced in WETH or STONKBROKER are counted.",
    Fees:
      "Paid by Book traders and holders: the anti-snipe tax on launch-curve buys and sells (it decays after a Book launches), the swap fee in each Book's locked Uniswap pool, and a 2% fee on a Book's closing value when its epoch ends and the vault is liquidated.",
    Revenue:
      "The StonkBrokers protocol's share of fees: 8.33% of the anti-snipe tax (16.67% on Books not priced in WETH, which have no StockBooster share) and half of the 2% close fee.",
    ProtocolRevenue:
      "8.33% of the anti-snipe tax (16.67% on Books not priced in WETH) and half of the 2% close fee, paid to the StonkBrokers treasury.",
    SupplySideRevenue:
      "Fees paid out to others: 75% of the anti-snipe tax into the Book's vault for its holders, 8.33% to the Book's creator, 8.34% on WETH Books to StockBooster dividends for activated StonkBrokers, all swap fees from the locked pools to Book LP stakers and the vault, and half of the 2% close fee to Mancer, which hosts Books.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.Tax]: "Anti-snipe tax on launch-curve buys and sells, which decays after a Book launches. 75% goes to the Book's vault, 8.33% to the creator, 8.33% to the treasury and 8.34% to StockBooster (to the treasury on Books not priced in WETH).",
      [LABELS.LpFees]: "Swap fee on trades in each Book's locked Uniswap v3 or v4 pool, measured on the WETH or STONKBROKER side.",
      [LABELS.CloseFee]: "2% of the Book's closing value when its epoch ends and the vault is liquidated, split evenly between the StonkBrokers treasury and Mancer, which hosts Books.",
    },
    Revenue: {
      [LABELS.TaxProtocol]: "8.33% of the anti-snipe tax (16.67% on Books not priced in WETH), kept by the protocol.",
      [LABELS.CloseProtocol]: "Half of the 2% close fee, kept by the protocol.",
    },
    ProtocolRevenue: {
      [LABELS.TaxProtocol]: "8.33% of the anti-snipe tax (16.67% on Books not priced in WETH), paid to the StonkBrokers treasury.",
      [LABELS.CloseProtocol]: "Half of the 2% close fee, paid to the StonkBrokers treasury.",
    },
    SupplySideRevenue: {
      [LABELS.TaxVault]: "75% of the anti-snipe tax, paid into the Book's vault for its holders.",
      [LABELS.TaxCreator]: "8.33% of the anti-snipe tax, paid to the Book's creator.",
      [LABELS.TaxBooster]: "8.34% of the anti-snipe tax on WETH Books, paid to StockBooster dividends for activated StonkBrokers.",
      [LABELS.LpFees]: "All swap fees from the locked Book pools, paid to Book LP stakers and the Book vault's own LP position.",
      [LABELS.CloseMancer]: "Half of the 2% close fee, paid to Mancer, which hosts Books.",
    },
  },
};

export default adapter;
