import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ROBINHOOD_WETH, UNI_V4_POOL_MANAGER, UNI_V4_SWAP, UNI_V4_SWAP_TOPIC0 } from "../stonkbrokers/helpers";

/**
 * StonkBrokers Nightshades — the Civilization anti-snipe faction launch on
 * Robinhood Chain (2026-09-14).
 *
 * Fee sources:
 * 1. Civilization anti-snipe pad: time-decay snipe tax on launch-curve buys
 *    (99% → 0 over a 99-minute buys-only window), WETH-quoted, split by the
 *    game hook 50% boost pot / 10% faction pool / 13.33% StockBooster /
 *    13.33% protocol / 13.34% creator, read exactly from PadTaxCollected.
 * 2. Post-bond faction pools: each faction bonds into a Uniswap v4 pool hooked
 *    by FactionGameHook; the ONLY liquidity provider is the
 *    FactionLiquidityVault, so the pool's 1% LP fee accrues 100% to the
 *    protocol-owned game position. After every night the hook re-opens
 *    trading behind a decaying snipe tax (SnipeTaxCollected, same split).
 * 3. Nightshades NFT royalties (ERC-2981, 10% of secondary sales) as flushed
 *    from the immutable royalty splitter: 75% game vault / 25% team.
 *
 * Volume: pad buys (PadBuy.quoteIn) and the WETH-side notional of user swaps
 * in the hooked faction pools.
 */

// One singleton pad hosts all four faction curves (launch ids 1–4: Ghosts,
// Watchers, Knights, Zombies).
const CIV_ANTI_SNIPE_PADS = [
  "0xca389585c4940B107D49AF4A37aD259c5fb69081", // Nightshades (Meebco), 2026-09-14
];
const CIV_FACTION_VAULT = "0xfff716727d7E80E29eab5D3498b7F28431e65C58";
const CIV_GAME_HOOK = "0x065388FA59505ceF471529FFa08d7EcfaB1fAACc";
// Immutable ERC-2981 receiver for the four Nightshades NFT collections (10%
// royalty on every secondary sale). Anyone may flush it: 75% of the balance
// goes to the game vault as free quote (deployed into the surviving faction's
// locked pool at the next boostSurvivor), 25% to the team wallet.
const CIV_ROYALTY_SPLITTER = "0x0296b9fb0cE78E2F6C95fdDE8A4427aAAA325D87";
const CIV_FACTION_VAULT_START = 62553793;

const PAD_BUY =
  "event PadBuy(uint256 indexed launchId, address indexed buyer, uint256 quoteIn, uint256 taxPaid, uint256 netIn, uint256 tokensOut)";
const PAD_TAX_COLLECTED =
  "event PadTaxCollected(uint256 indexed launchId, uint256 tax, uint256 boost, uint256 lp, uint256 booster, uint256 protocol, uint256 creator)";
const FACTION_REGISTERED =
  "event FactionRegistered(bytes32 indexed factionId, address indexed token, bytes32 indexed poolId, address anvilFactory, uint256 anvilMarketId, address nftCollection)";
const SNIPE_TAX_COLLECTED =
  "event SnipeTaxCollected(bytes32 indexed poolId, uint256 taxWeth, uint16 taxBps, uint256 boostAmount, uint256 lpAmount, uint256 boosterAmount, uint256 protocolAmount, uint256 creatorAmount)";
const ROYALTY_FLUSHED = "event Flushed(address indexed token, uint256 toPot, uint256 toTeam)";

const LABELS = {
  CIV_TAX: "Civilization anti-snipe pad snipe tax (Nightshades faction launches, time-decay tax on curve buys)",
  CIV_REOPEN_TAX: "Civilization sunrise reopen snipe tax (daily time-decay tax on hooked v4 pool trades after each night)",
  CIV_TAX_PROTOCOL: "Civilization snipe tax → protocol treasury (13.33%)",
  CIV_TAX_BOOST: "Civilization snipe tax → next-night boost pot (50%)",
  CIV_TAX_LP: "Civilization snipe tax → faction's own locked pool (10%)",
  CIV_TAX_BOOSTER: "Civilization snipe tax → StockBooster dividends (13.33%)",
  CIV_TAX_CREATOR: "Civilization snipe tax → game creator (13.34%)",
  CIV_POOL_SWAPS: "Civilization faction pool swaps (Nightshades hooked Uniswap v4 pools)",
  CIV_POOL_LP_FEES: "Civilization faction pool 1% LP fee (100% protocol-owned game liquidity)",
  CIV_NFT_ROYALTY_POT: "Nightshades NFT royalty (10% of secondary sales) → game vault as survivor pool liquidity (75%)",
  CIV_NFT_ROYALTY_TEAM: "Nightshades NFT royalty (10% of secondary sales) → team wallet (25%)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [civBuyLogs, civTaxLogs] = await Promise.all([
    options.getLogs({ targets: CIV_ANTI_SNIPE_PADS, eventAbi: PAD_BUY }),
    options.getLogs({ targets: CIV_ANTI_SNIPE_PADS, eventAbi: PAD_TAX_COLLECTED }),
  ]);

  // Discover every faction's hooked v4 pool id from the vault's registration
  // events (full history, cached), then read the PoolManager Swap tape for
  // those pools plus the hook's reopen snipe tax. entireLog keeps
  // transactionHash so a buy's tax can be re-added to the net-of-tax Swap
  // delta (see the volume section below).
  const factionRegistered = await options.getLogs({
    target: CIV_FACTION_VAULT,
    fromBlock: CIV_FACTION_VAULT_START,
    eventAbi: FACTION_REGISTERED,
    cacheInCloud: true,
  });
  const civPoolIds = [
    ...new Set(
      factionRegistered
        .map((l: any) => String(l.poolId || "").toLowerCase())
        .filter((id: string) => /^0x[0-9a-f]{64}$/.test(id)),
    ),
  ];
  // One Swap query per pool id (topic1 filter) — the indexer path takes a
  // single topic1 string, so an OR-array of pool ids is not portable.
  const [civPoolSwapLogsByPool, civReopenTaxLogs, civRoyaltyFlushLogs] = await Promise.all([
    Promise.all(
      civPoolIds.map((poolId) =>
        options.getLogs({
          target: UNI_V4_POOL_MANAGER,
          topics: [UNI_V4_SWAP_TOPIC0, poolId],
          eventAbi: UNI_V4_SWAP,
          entireLog: true,
        }),
      ),
    ),
    options.getLogs({ target: CIV_GAME_HOOK, eventAbi: SNIPE_TAX_COLLECTED, entireLog: true }),
    options.getLogs({ target: CIV_ROYALTY_SPLITTER, eventAbi: ROYALTY_FLUSHED }),
  ]);
  const civPoolSwapLogs: any[] = civPoolSwapLogsByPool.flat();

  // ── Anti-snipe pad ───────────────────────────────────────────────────────
  // PadBuy.quoteIn is the tax-inclusive notional; the fee legs come straight
  // off PadTaxCollected (exact wei, no re-derivation). The net raise bonds
  // into the hooked v4 pool under the game vault, so the tax is the only leg
  // that leaves the curve.
  for (const log of civBuyLogs) {
    const quoteIn = BigInt(log.quoteIn);
    if (quoteIn > 0n) dailyVolume.add(ROBINHOOD_WETH, quoteIn);
  }
  for (const log of civTaxLogs) {
    const tax = BigInt(log.tax);
    if (tax <= 0n) continue;
    const toProtocol = BigInt(log.protocol);
    dailyFees.add(ROBINHOOD_WETH, tax, LABELS.CIV_TAX);
    dailyRevenue.add(ROBINHOOD_WETH, toProtocol, LABELS.CIV_TAX_PROTOCOL);
    dailyProtocolRevenue.add(ROBINHOOD_WETH, toProtocol, LABELS.CIV_TAX_PROTOCOL);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(log.boost), LABELS.CIV_TAX_BOOST);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(log.lp), LABELS.CIV_TAX_LP);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(log.booster), LABELS.CIV_TAX_BOOSTER);
    // The creator leg pays the game team, not the protocol — counted in fees,
    // excluded from revenue/protocolRevenue.
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(log.creator), LABELS.CIV_TAX_CREATOR);
  }

  // ── Faction pools (post-bond, hooked Uniswap v4) ─────────────────────────
  // Volume = WETH-side notional of every user swap (the vault's own night
  // operations — damage sells / survivor buys, sender == vault — are internal
  // rebalances and excluded). During the daily sunrise reopen the hook levies
  // a decaying snipe tax: on BUYS it is removed via beforeSwapDelta, so the
  // Swap event carries the net-of-tax WETH — the matching SnipeTaxCollected
  // adds it back to reach the gross the user paid; on SELLS the event already
  // carries the gross WETH out (the hook skims the tax off the output).
  // The hook distributes + emits the tax in afterSwap for BOTH directions, so
  // SnipeTaxCollected always follows its Swap in the same tx: each swap
  // consumes the first not-yet-claimed tax log after it (same tx + pool), and
  // only WETH-input swaps gross up — a taxed sell in the same tx never leaks
  // into a buy's notional.
  //
  // The v4 LP fee is charged on the input currency. WETH-input fees are
  // booked as-is; faction-token-input fees are valued in WETH at the swap's
  // own execution price (|amountWeth| / net token input, i.e. |amountToken|
  // less the fee that never reached the curve), since faction tokens have no
  // oracle price feed.
  const civTokenByPool = new Map<string, string>();
  for (const l of factionRegistered) {
    const id = String(l.poolId || "").toLowerCase();
    const token = String(l.token || "").toLowerCase();
    if (id && token) civTokenByPool.set(id, token);
  }
  const civLogIndex = (log: any): number => Number(log.logIndex ?? log.index ?? log.log_index ?? 0);
  const civReopenTaxByTxPool = new Map<string, { logIndex: number; taxWeth: bigint }[]>();
  for (const log of civReopenTaxLogs) {
    const args = log.args ?? log.parsedLog?.args ?? log;
    const taxWeth = BigInt(args.taxWeth ?? 0);
    if (taxWeth <= 0n) continue;
    const key = `${String(log.transactionHash).toLowerCase()}:${String(args.poolId).toLowerCase()}`;
    const list = civReopenTaxByTxPool.get(key) ?? [];
    list.push({ logIndex: civLogIndex(log), taxWeth });
    civReopenTaxByTxPool.set(key, list);
    const toProtocol = BigInt(args.protocolAmount ?? 0);
    dailyFees.add(ROBINHOOD_WETH, taxWeth, LABELS.CIV_REOPEN_TAX);
    dailyRevenue.add(ROBINHOOD_WETH, toProtocol, LABELS.CIV_TAX_PROTOCOL);
    dailyProtocolRevenue.add(ROBINHOOD_WETH, toProtocol, LABELS.CIV_TAX_PROTOCOL);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(args.boostAmount ?? 0), LABELS.CIV_TAX_BOOST);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(args.lpAmount ?? 0), LABELS.CIV_TAX_LP);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(args.boosterAmount ?? 0), LABELS.CIV_TAX_BOOSTER);
    dailySupplySideRevenue.add(ROBINHOOD_WETH, BigInt(args.creatorAmount ?? 0), LABELS.CIV_TAX_CREATOR);
  }
  // Nightshades NFT royalties. The splitter is the ERC-2981 receiver for all
  // four faction collections; a permissionless flush wraps any native ETH to
  // WETH first, so `token` is always a real ERC-20 (WETH for ETH sales, the
  // sale currency otherwise). Neither leg is protocol revenue: 75% seeds the
  // surviving faction's locked pool, 25% pays the game team.
  for (const log of civRoyaltyFlushLogs) {
    const token = String(log.token || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token)) continue;
    const toPot = BigInt(log.toPot ?? 0);
    const toTeam = BigInt(log.toTeam ?? 0);
    if (toPot + toTeam <= 0n) continue;
    dailyFees.add(token, toPot, LABELS.CIV_NFT_ROYALTY_POT);
    dailyFees.add(token, toTeam, LABELS.CIV_NFT_ROYALTY_TEAM);
    dailySupplySideRevenue.add(token, toPot, LABELS.CIV_NFT_ROYALTY_POT);
    dailySupplySideRevenue.add(token, toTeam, LABELS.CIV_NFT_ROYALTY_TEAM);
  }
  for (const list of civReopenTaxByTxPool.values()) list.sort((a, b) => a.logIndex - b.logIndex);
  const civVaultLower = CIV_FACTION_VAULT.toLowerCase();
  const civWethLower = ROBINHOOD_WETH.toLowerCase();
  // Ascending logIndex so swaps inside one tx claim their tax logs in order.
  civPoolSwapLogs.sort((a, b) => civLogIndex(a) - civLogIndex(b));
  for (const log of civPoolSwapLogs) {
    const args = log.args ?? log.parsedLog?.args ?? log;
    const poolId = String(args.id ?? "").toLowerCase();
    const sender = String(args.sender ?? "").toLowerCase();
    if (sender === civVaultLower) continue; // vault night ops, not user flow
    const token = civTokenByPool.get(poolId);
    if (!token) continue;
    // v4 sorts currencies by address; WETH is currency0 iff it is the lower.
    const wethIs0 = civWethLower < token;
    const amount0 = BigInt(args.amount0);
    const amount1 = BigInt(args.amount1);
    const amountWeth = wethIs0 ? amount0 : amount1;
    const amountToken = wethIs0 ? amount1 : amount0;
    const absWeth = amountWeth < 0n ? -amountWeth : amountWeth;
    const absToken = amountToken < 0n ? -amountToken : amountToken;
    if (absWeth <= 0n) continue;
    const wethIsInput = amountWeth < 0n;

    // Claim this swap's reopen tax log (the first unclaimed one emitted after
    // it in the same tx + pool) regardless of direction, so a taxed sell can
    // never hand its tax to a later buy in the same tx.
    let reopenTax = 0n;
    const taxKey = `${String(log.transactionHash).toLowerCase()}:${poolId}`;
    const taxList = civReopenTaxByTxPool.get(taxKey);
    if (taxList?.length) {
      const swapIdx = civLogIndex(log);
      const at = taxList.findIndex((t) => t.logIndex > swapIdx);
      if (at >= 0) reopenTax = taxList.splice(at, 1)[0].taxWeth;
    }
    // Buy during a reopen window: the hook stripped the tax pre-swap, so add
    // it back to reach the gross the user paid. Sells already carry gross out.
    const grossWeth = wethIsInput ? absWeth + reopenTax : absWeth;
    dailyVolume.add(ROBINHOOD_WETH, grossWeth, LABELS.CIV_POOL_SWAPS);

    const feePpm = BigInt(args.fee ?? 0);
    if (feePpm <= 0n) continue;
    const inputAmount = wethIsInput ? absWeth : absToken;
    const feeAmount = (inputAmount * feePpm) / 1_000_000n;
    if (feeAmount <= 0n) continue;
    // Token-input fee is valued at the curve's execution price: the WETH out
    // was bought with the NET token input (gross minus the fee kept by LPs).
    const netTokenInput = absToken - feeAmount;
    const feeWeth = wethIsInput ? feeAmount : netTokenInput > 0n ? (feeAmount * absWeth) / netTokenInput : 0n;
    if (feeWeth <= 0n) continue;
    dailyFees.add(ROBINHOOD_WETH, feeWeth, LABELS.CIV_POOL_LP_FEES);
    dailyRevenue.add(ROBINHOOD_WETH, feeWeth, LABELS.CIV_POOL_LP_FEES);
    dailyProtocolRevenue.add(ROBINHOOD_WETH, feeWeth, LABELS.CIV_POOL_LP_FEES);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-14",
  doublecounted: true,
  methodology: {
    Volume:
      "Civilization anti-snipe pad PadBuy.quoteIn (WETH, Nightshades faction launches) + post-bond faction pool swaps (WETH-side notional of every user swap in the hooked Uniswap v4 faction pools; reopen-window buys grossed up by the same-tx SnipeTaxCollected; the vault's own night rebalances excluded).",
    Fees:
      "The Civilization anti-snipe pad snipe tax on Nightshades faction curve buys (PadTaxCollected — 50% next-night boost pot / 10% faction pool / 13.33% StockBooster / 13.33% protocol / 13.34% game creator, WETH); the sunrise reopen snipe tax levied by the game hook on hooked v4 pool trades after each night (SnipeTaxCollected, same five-way split); the 1% LP fee on every user swap in the hooked faction pools (100% protocol-owned game liquidity — the vault is the pools' only permitted LP); and Nightshades faction NFT royalties (ERC-2981 10% of secondary sales) as flushed from the immutable FactionRoyaltySplitter (75% game vault survivor liquidity / 25% team).",
    Revenue:
      "The 13.33% protocol treasury leg of the pad + sunrise reopen snipe taxes, and the 1% LP fee accruing to the protocol-owned faction pool liquidity.",
    ProtocolRevenue:
      "13.33% of the pad + sunrise reopen snipe taxes → protocol treasury; the faction pools' 1% LP fee → the vault's protocol-owned game liquidity position (compounds into game LP, not distributed).",
    SupplySideRevenue:
      "Pad + sunrise reopen tax legs to the next-night boost pot (50%), the faction's own locked pool (10%), StockBooster (13.33%) and the game creator (13.34%), plus both legs of the flushed NFT royalties.",
  },
  breakdownMethodology: {
    Volume: {
      [LABELS.CIV_TAX]:
        "Civilization anti-snipe pad curve buys on the Nightshades faction launches (PadBuy.quoteIn, tax-inclusive, WETH).",
      [LABELS.CIV_POOL_SWAPS]:
        "WETH-side notional of user swaps in the hooked Uniswap v4 Civilization faction pools (pool ids from FactionLiquidityVault.FactionRegistered). Reopen-window buys are grossed up by the same-tx SnipeTaxCollected.taxWeth (the hook strips the tax before the swap); sells already carry gross WETH out. Swaps with sender == the game vault (night damage sells / survivor buys) are internal rebalances and excluded.",
    },
    Fees: {
      [LABELS.CIV_TAX]:
        "Time-decay snipe tax on Civilization anti-snipe pad curve buys (Nightshades faction launches; 99% at the bell falling to 0 over a 99-minute buys-only window; PadTaxCollected.tax, WETH). Split by the game hook per trade: 50% next-night boost pot / 10% the faction's own locked pool / 13.33% StockBooster / 13.33% protocol treasury / 13.34% game creator.",
      [LABELS.CIV_REOPEN_TAX]:
        "Daily sunrise reopen snipe tax levied by FactionGameHook on hooked v4 faction pool buys and sells after each night (SnipeTaxCollected.taxWeth; decays from 99% to 0 over the 60-minute sunrise window). Same five-way split as the pad tax: 50% next-night boost / 10% faction pool / 13.33% StockBooster / 13.33% protocol treasury / 13.34% game creator.",
      [LABELS.CIV_POOL_LP_FEES]:
        "1% Uniswap v4 LP fee on every user swap in the hooked Civilization faction pools (Swap.fee ppm × input amount). The game vault is the only LP the hook permits, so 100% accrues to protocol-owned game liquidity. WETH-input fees booked as-is; faction-token-input fees valued in WETH at the swap's own execution price.",
      [LABELS.CIV_NFT_ROYALTY_POT]:
        "Nightshades faction NFT royalties (ERC-2981, 10% of every secondary sale) as they are flushed out of the immutable FactionRoyaltySplitter (Flushed.toPot + toTeam; native ETH is wrapped to WETH before the split). Counted at flush time, not at sale time. 75% → game vault as free quote deployed into the surviving faction's locked pool.",
      [LABELS.CIV_NFT_ROYALTY_TEAM]: "25% team leg of the flushed Nightshades NFT royalties.",
    },
    Revenue: {
      [LABELS.CIV_TAX_PROTOCOL]:
        "13.33% protocol treasury leg of the Civilization anti-snipe pad + sunrise reopen snipe taxes (Nightshades).",
      [LABELS.CIV_POOL_LP_FEES]:
        "1% LP fee on Civilization faction pool swaps accruing to the vault's protocol-owned game liquidity position (compounds into game LP; not distributed to holders).",
    },
    ProtocolRevenue: {
      [LABELS.CIV_TAX_PROTOCOL]:
        "13.33% protocol treasury leg of the Civilization anti-snipe pad + sunrise reopen snipe taxes (Nightshades).",
      [LABELS.CIV_POOL_LP_FEES]:
        "1% LP fee on Civilization faction pool swaps accruing to the vault's protocol-owned game liquidity position (compounds into game LP; not distributed to holders).",
    },
    SupplySideRevenue: {
      [LABELS.CIV_TAX_BOOST]:
        "50% of the Civilization pad + sunrise reopen snipe taxes → the next night's boost pot (buys the surviving faction after each night; escrowed in the game vault).",
      [LABELS.CIV_TAX_LP]:
        "10% of the Civilization pad + sunrise reopen snipe taxes → the paying faction's own protocol-owned locked pool.",
      [LABELS.CIV_TAX_BOOSTER]:
        "13.33% of the Civilization pad + sunrise reopen snipe taxes → StockBooster → Clock In dividends to activated brokers.",
      [LABELS.CIV_TAX_CREATOR]: "13.34% of the Civilization pad + sunrise reopen snipe taxes → game creator (Meebco).",
      [LABELS.CIV_NFT_ROYALTY_POT]:
        "75% of flushed Nightshades NFT royalties → game vault as free quote, deployed into the surviving faction's protocol-owned locked pool at the next boostSurvivor.",
      [LABELS.CIV_NFT_ROYALTY_TEAM]: "25% of flushed Nightshades NFT royalties → game team wallet.",
    },
  },
};

export default adapter;
