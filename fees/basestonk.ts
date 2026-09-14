import { AbiCoder, keccak256 } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// BaseStonk - a launchpad on Base and Robinhood Chain where every token opens
// in a Uniswap v4 pool priced in a tokenized stock, ETF, major or stablecoin.
// A BaseStonk hook on that pool takes a tax on every swap and splits it in the
// same transaction:
//
//   - the platform's cut goes to the treasury: half the tax, capped at 1% of
//     the trade (LaunchFees.platformCut);
//   - the creator's cut is split by the launch's own configuration between a
//     burn of the launch token, a hook-owned liquidity wedge, the creator's
//     wallets, the token's dividend distributor (its holders), and - on Base -
//     the BSTONK basket vault, which pays BSTONK holders. Whatever the payee
//     list leaves unplaced is swept to the treasury (RemainderSwept).
//
// Fees is the whole tax, from the hook's FeeTaken event. Revenue is the
// treasury's take plus what reaches BSTONK holders; everything else in the
// creator's cut is supply-side.
//
// The fee is taken in the swap's UNSPECIFIED currency: a buy pays it in the
// launch token, a sell in the pair. Launch tokens only trade in these pools,
// so a token-denominated fee is converted into the pair at the pool price the
// same transaction's Swap event reports (sqrtPriceX96), and every amount is
// booked in a currency that has a market.
//
// https://basestonk.io - https://docs.basestonk.io

type ChainConfig = {
  start: string;
  poolManager: string;
  hooks: string[];
  // the pairs every day's fees are certain to include, so a pool whose other
  // side never paid a fee in the window can still be placed
  knownPairs: string[];
  // BSTONK's own value-accrual recipients - Base only, BSTONK lives on Base
  holderRecipients?: { bstonk: string; tracker: string; vaults: string[] };
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    // first launch (BSTONK itself) at 2026-08-16 22:50 UTC, block 50065628.
    // The launch day carried $5.3M of volume and $52.6k of fees; a start of
    // 08-17 dropped every hour of it.
    start: "2026-08-16",
    // https://basescan.org/address/0x498581fF718922c3f8e6A244956aF099B2652b2b
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    knownPairs: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
      "0x4200000000000000000000000000000000000006", // WETH
      "0x0f61edbfe6cd86024c0f210c0695b08df55fdfc9", // BSTONK
    ],
    // every hook generation; each one emits the same FeeTaken / RemainderSwept
    hooks: [
      "0x03d2434d5a9ab7fb46bd3c7956a7c62e0cd46044", // v2
      "0xe6b2b3e59d5df7827eb0a7915675db66ab12a044", // v3
      "0xbeff407b7062e2fe15928960a58aec93b0c76044", // v4
      "0xba83ee6969d09ceb8a4827c3ed77413c75392044", // v5
      "0x1d118173e0d717d70746adfe730bd4b89d2de044", // v5
      "0x201c4916c085032fb49f0b778efa98df23672044", // v5
      "0x7c672f3850afadcb8f83478e0a2a90d109fa6044", // v6
      "0x805975d27518e3e23c4838802d9dda7302dca044", // B20 v1
      "0xaa4025e5667719db2ceaa0c1ed8801ce7bdfa044", // B20 v6
    ],
    holderRecipients: {
      // https://basescan.org/token/0x0F61Edbfe6Cd86024C0f210c0695B08df55fdfc9
      bstonk: "0x0f61edbfe6cd86024c0f210c0695b08df55fdfc9",
      // BSTONK's dividend distributor: the payee on BSTONK's own pool
      tracker: "0x7f03e814eb1b5dd0c587dc637eea591bce0cd2ce",
      vaults: [
        "0xa971a4627a6388f38e0ab6cf53f69196ee58293d", // v1
        "0x99feb612f130c5e981dbc0a96c436bc06ca0fe9e", // v2
      ],
    },
  },
  [CHAIN.ROBINHOOD]: {
    // launcher deployed block 54058114, 2026-09-04 06:39 UTC
    start: "2026-09-04",
    // https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951
    poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    knownPairs: [
      "0x5fc5360d0400a0fd4f2af552add042d716f1d168", // USDG
      "0x0bd7d308f8e1639fab988df18a8011f41eacad73", // WETH
    ],
    // https://robinhoodchain.blockscout.com/address/0xF42bC6ca0D082D3Af51771392CeC847a01A6e044
    hooks: ["0xf42bc6ca0d082d3af51771392cec847a01a6e044"], // v6
  },
};

// Every launcher opens its pool with the same fee and spacing, so a pool id is
// keccak256(abi.encode(currency0, currency1, 3000, 60, hook)) and a guess at
// the second currency can be checked without asking the chain.
const POOL_FEE = 3000;
const TICK_SPACING = 60;

const feeTakenAbi = "event FeeTaken(bytes32 indexed id, address currency, uint256 platform, uint256 creator)";
const remainderSweptAbi = "event RemainderSwept(bytes32 indexed id, address currency, uint256 amount)";
const creatorShareSplitAbi = "event CreatorShareSplit(bytes32 indexed id, uint256 burnt, uint256 toLiquidity, uint256 paid)";
const boughtBackAbi = "event BoughtBackAndBurnt(bytes32 indexed id, uint256 spent, uint256 burnt)";
const swapAbi =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const transferAbi = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BURN = "0x000000000000000000000000000000000000dead";

const LABEL = {
  swapFees: METRIC.SWAP_FEES,
  toTreasury: "Swap Fees To Treasury",
  sweptToTreasury: "Unplaced Creator Fees To Treasury",
  toCreators: "Swap Fees To Creators And Token Holders",
  toBstonkHolders: "Swap Fees To BSTONK Holders",
  basketToBstonkHolders: "Basket Dividends To BSTONK Holders",
  bstonkBurn: "BSTONK Burn",
};

type Launch = { token: string; pair: string; tokenIs0: boolean };
type SwapLog = { logIndex: number; sqrtPriceX96: bigint; sender: string; amount0: bigint; amount1: bigint };

const low = (s: any) => String(s).toLowerCase();
const big = (v: any) => BigInt(v.toString());
const abs = (v: bigint) => (v < 0n ? -v : v);
const topicOf = (address: string) => "0x" + address.toLowerCase().replace("0x", "").padStart(64, "0");
const Q192 = 1n << 192n;

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances, chain } = options;
  const config = chainConfig[chain];
  const hooks = config.hooks;
  const logOptions = { entireLog: true, parseLog: true };

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyVolume = createBalances();

  const feeLogs = await getLogs({ targets: hooks, eventAbi: feeTakenAbi, ...logOptions });
  const sweptLogs = await getLogs({ targets: hooks, eventAbi: remainderSweptAbi, ...logOptions });

  const poolIdOf = (a: string, b: string, hook: string) => {
    const [c0, c1] = a < b ? [a, b] : [b, a];
    return keccak256(AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [c0, c1, POOL_FEE, TICK_SPACING, hook]));
  };
  const launches = new Map<string, Launch>();
  // every launcher mines the token's CREATE2 salt so it sorts below its pair
  // (a launch that would not reverts with TokenMustSortBelowPair), so the
  // token is always currency0
  const place = (id: string, a: string, b: string) => {
    const [token, pair] = a < b ? [a, b] : [b, a];
    launches.set(id, { token, pair, tokenIs0: true });
  };
  const seenOn = new Map<string, { hook: string; currencies: Set<string>; tx: string }>();
  for (const log of [...feeLogs, ...sweptLogs]) {
    const id = low(log.args.id);
    const row = seenOn.get(id) ?? { hook: low(log.address), currencies: new Set<string>(), tx: low(log.transactionHash) };
    row.currencies.add(low(log.args.currency));
    seenOn.set(id, row);
  }
  const candidates = new Set<string>(config.knownPairs);
  for (const row of seenOn.values()) for (const c of row.currencies) candidates.add(c);
  const unplaced: string[] = [];
  for (const [id, row] of seenOn) {
    const [c] = row.currencies;
    const other = [...candidates].find((x) => x !== c && poolIdOf(c, x, row.hook) === id);
    if (other) place(id, c, other);
    else unplaced.push(id);
  }
  if (unplaced.length) {
    const trackers = await options.api.multiCall({
      abi: "address:rewardTracker",
      calls: unplaced.map((id) => [...seenOn.get(id)!.currencies][0]),
      permitFailure: true,
    });
    const pairs = await options.api.multiCall({
      abi: "address:rewardToken",
      calls: trackers.map((t: string | null) => t ?? "0x0000000000000000000000000000000000000000"),
      permitFailure: true,
    });
    for (let i = unplaced.length - 1; i >= 0; i--) {
      const id = unplaced[i];
      const { hook, currencies } = seenOn.get(id)!;
      const [token] = currencies;
      const pair = pairs[i] ? low(pairs[i]) : undefined;
      if (pair && poolIdOf(token, pair, hook) === id) {
        place(id, token, pair);
        unplaced.splice(i, 1);
      }
    }
  }
  if (unplaced.length) {
    const receipts = await getTxReceiptsWithRetry(chain, unplaced.map((id) => seenOn.get(id)!.tx));
    receipts.forEach((receipt, i) => {
      const id = unplaced[i];
      const { hook, currencies } = seenOn.get(id)!;
      const [known] = currencies;
      const moved = new Set<string>();
      for (const log of receipt?.logs ?? []) {
        if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
        const from = "0x" + log.topics[1].slice(26);
        const to = "0x" + log.topics[2].slice(26);
        if (from === config.poolManager || to === config.poolManager) moved.add(low(log.address));
      }
      const other = [...moved].find((x) => x !== known && poolIdOf(known, x, hook) === id);
      if (other) place(id, known, other);
    });
  }

  const activePools = [...new Set<string>([...feeLogs, ...sweptLogs].map((l: any) => low(l.args.id)))].filter((id) => launches.has(id));

  // one call per pool id: topic1 OR of many ids is slower on the v4 PoolManager
  // (some indexers scan every Swap then filter) and can hit the log cap
  const swapLogs = !activePools.length
    ? []
    : await Promise.all(activePools.map((id) => getLogs({ target: config.poolManager, eventAbi: swapAbi, topics: [SWAP_TOPIC, id], ...logOptions })));
  const swapsByPool = new Map<string, Map<string, SwapLog[]>>();
  for (const id of activePools) swapsByPool.set(id, new Map());
  for (const log of swapLogs.flat()) {
    const byTx = swapsByPool.get(low(log.args.id));
    if (!byTx) continue;
    const tx = low(log.transactionHash);
    const row = byTx.get(tx) ?? [];
    row.push({
      logIndex: Number(log.logIndex),
      sqrtPriceX96: big(log.args.sqrtPriceX96),
      sender: low(log.args.sender),
      amount0: big(log.args.amount0),
      amount1: big(log.args.amount1),
    });
    byTx.set(tx, row);
  }
  for (const byTx of swapsByPool.values()) for (const row of byTx.values()) row.sort((a, b) => a.logIndex - b.logIndex);

  const priceIn = (id: string, tx: string, logIndex: number): bigint | undefined => {
    const row = swapsByPool.get(id)?.get(tx);
    if (!row?.length) return undefined;
    let pick: SwapLog | undefined;
    for (const s of row) if (s.logIndex < logIndex) pick = s;
    return pick?.sqrtPriceX96;
  };

  const toPair = (id: string, currency: string, amount: bigint, tx: string, logIndex: number): [string, bigint] | undefined => {
    const launch = launches.get(id);
    if (!launch) {
      console.error(`basestonk: ${chain} pool ${id} is not in the launch map, tx ${tx}`);
      return undefined;
    }
    if (currency === launch.pair) return [launch.pair, amount];
    if (currency !== launch.token) {
      console.error(`basestonk: ${chain} pool ${id} paid in ${currency}, neither its token nor its pair, tx ${tx}`);
      return undefined;
    }
    const sqrtPriceX96 = priceIn(id, tx, logIndex);
    if (sqrtPriceX96 === undefined) {
      console.error(`basestonk: ${chain} pool ${id} has no Swap to price its fee in tx ${tx}`);
      return undefined;
    }
    const p2 = sqrtPriceX96 * sqrtPriceX96;
    return [launch.pair, launch.tokenIs0 ? (amount * p2) / Q192 : (amount * Q192) / p2];
  };

  type Ledger = Map<string, bigint>;
  const put = (l: Ledger, currency: string, amount: bigint) => l.set(currency, (l.get(currency) ?? 0n) + amount);
  const creatorCut: Ledger = new Map();
  for (const log of feeLogs) {
    const id = low(log.args.id);
    const tx = low(log.transactionHash);
    const idx = Number(log.logIndex);
    const platform = big(log.args.platform);
    const creator = big(log.args.creator);
    const priced = toPair(id, low(log.args.currency), platform + creator, tx, idx);
    if (!priced) continue;
    const [currency, total] = priced;
    const platformPriced = platform + creator === 0n ? 0n : (total * platform) / (platform + creator);
    dailyFees.add(currency, total, LABEL.swapFees);
    dailyProtocolRevenue.add(currency, platformPriced, LABEL.toTreasury);
    put(creatorCut, currency, total - platformPriced);
  }

  const swept: Ledger = new Map();
  for (const log of sweptLogs) {
    const id = low(log.args.id);
    const priced = toPair(id, low(log.args.currency), big(log.args.amount), low(log.transactionHash), Number(log.logIndex));
    if (!priced) continue;
    const [currency, amount] = priced;
    dailyProtocolRevenue.add(currency, amount, LABEL.sweptToTreasury);
    put(swept, currency, amount);
  }

  const heldBack: Ledger = new Map();
  const recipients = config.holderRecipients;
  if (recipients) {
    type FeeSlot = { logIndex: number; id: string; currency: string; paidLeft: bigint; burn: bigint };
    const feesByTx = new Map<string, FeeSlot[]>();
    for (const log of feeLogs) {
      const tx = low(log.transactionHash);
      const row = feesByTx.get(tx) ?? [];
      row.push({ logIndex: Number(log.logIndex), id: low(log.args.id), currency: low(log.args.currency), paidLeft: 0n, burn: 0n });
      feesByTx.set(tx, row);
    }
    for (const row of feesByTx.values()) row.sort((a, b) => a.logIndex - b.logIndex);
    const feeAfter = (tx: string, logIndex: number, id: string) => feesByTx.get(tx)?.find((f) => f.logIndex > logIndex && f.id === id);
    const [splitLogs, buybackLogs] = await Promise.all([
      getLogs({ targets: hooks, eventAbi: creatorShareSplitAbi, ...logOptions }),
      getLogs({ targets: hooks, eventAbi: boughtBackAbi, ...logOptions }),
    ]);
    for (const log of splitLogs) {
      const fee = feeAfter(low(log.transactionHash), Number(log.logIndex), low(log.args.id));
      if (!fee) continue;
      fee.paidLeft = big(log.args.paid);
      if (fee.currency === launches.get(fee.id)?.token) fee.burn = big(log.args.burnt);
    }
    for (const log of buybackLogs) {
      const fee = feeAfter(low(log.transactionHash), Number(log.logIndex), low(log.args.id));
      if (fee) fee.burn = big(log.args.burnt);
    }
    const bookPayout = (log: any, isBurn: boolean): [string, bigint] | undefined => {
      const token = low(log.address);
      const amount = big(log.args.value);
      const tx = low(log.transactionHash);
      const logIndex = Number(log.logIndex);
      const fee = feesByTx.get(tx)?.find((f) => {
        if (f.logIndex < logIndex) return false;
        if (isBurn) return f.burn === amount && launches.get(f.id)?.token === token;
        return f.currency === token && f.paidLeft >= amount;
      });
      if (!fee) return undefined;
      if (isBurn) fee.burn = 0n;
      else fee.paidLeft -= amount;
      return toPair(fee.id, token, amount, tx, fee.logIndex);
    };

    const payouts = await Promise.all(
      [recipients.tracker, ...recipients.vaults].map((recipient) =>
        getLogs({
          noTarget: true,
          eventAbi: transferAbi,
          topics: [TRANSFER_TOPIC, topicOf(config.poolManager), topicOf(recipient)],
          ...logOptions,
        }),
      ),
    );
    payouts.forEach((logs, i) => {
      const label = i === 0 ? LABEL.toBstonkHolders : LABEL.basketToBstonkHolders;
      for (const log of logs) {
        const priced = bookPayout(log, false);
        if (!priced) continue;
        const [currency, amount] = priced;
        dailyHoldersRevenue.add(currency, amount, label);
        put(heldBack, currency, amount);
      }
    });

    const burns = await getLogs({
      target: recipients.bstonk,
      eventAbi: transferAbi,
      topics: [TRANSFER_TOPIC, topicOf(config.poolManager), topicOf(BURN)],
      ...logOptions,
    });
    for (const log of burns) {
      const priced = bookPayout(log, true);
      if (!priced) continue;
      const [currency, amount] = priced;
      dailyHoldersRevenue.add(currency, amount, LABEL.bstonkBurn);
      put(heldBack, currency, amount);
    }
  }

  for (const [currency, amount] of creatorCut) {
    const left = amount - (swept.get(currency) ?? 0n) - (heldBack.get(currency) ?? 0n);
    if (left < 0n) {
      console.error(`basestonk: ${chain} creator cut in ${currency} short by ${-left} after sweeps and BSTONK holder payouts`);
      continue;
    }
    dailySupplySideRevenue.add(currency, left, LABEL.toCreators);
  }

  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  const hookSet = new Set(hooks);
  for (const [id, byTx] of swapsByPool) {
    const launch = launches.get(id)!;
    for (const row of byTx.values()) {
      for (const s of row) {
        if (hookSet.has(s.sender)) continue;
        dailyVolume.add(launch.pair, abs(launch.tokenIs0 ? s.amount1 : s.amount0));
      }
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyVolume };
};

const methodology = {
  Fees: "The tax BaseStonk's Uniswap v4 hook takes on every swap in a launched token's pool, from the hook's FeeTaken event. Each launch sets its own buy and sell rate. A buy pays the tax in the launch token and a sell in the pair; token-denominated amounts are converted into the pair at the pool price the same transaction's Swap reports.",
  Revenue: "The platform's cut of the tax plus what reaches BSTONK holders: half the tax capped at 1% of the trade to the treasury, any part of the creator's cut the payee list left unplaced and the hook swept to the treasury, and the share of the creator's cut paid to BSTONK's dividend distributor, to the BSTONK basket vault, or burnt as BSTONK.",
  ProtocolRevenue: "The treasury's take: half the tax capped at 1% of the trade, plus unplaced creator fees swept to it.",
  HoldersRevenue: "Value to BSTONK holders, paid by the hook in the transaction the fee was taken: BSTONK's own pool pays its creator cut to BSTONK's dividend distributor and burns half of it, and launches carry the BSTONK basket vault as a payee; the vault pays BSTONK holders in rounds. Base only - BSTONK lives on Base.",
  SupplySideRevenue: "The creator's cut of the tax less what the treasury swept and what reached BSTONK holders: the creator's wallets, the launch token's own holders through its dividend distributor, the burn of the launch token and the hook-owned liquidity wedge, as each launch configured them.",
  Volume: "The pair side of every swap in a taxed pool, including the creator's dev buy at launch and excluding the hook's own buyback and liquidity swaps. Counted under Uniswap v4 as well.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "The hook's tax on each swap in a launched token's pool, at the launch's buy or sell rate.",
  },
  Revenue: {
    [LABEL.toTreasury]: "The platform's cut of the tax: half of it, capped at 1% of the trade, paid to the treasury.",
    [LABEL.sweptToTreasury]: "The part of the creator's cut the launch's payee list left unplaced, swept to the treasury.",
    [LABEL.toBstonkHolders]: "The creator cut of BSTONK's own pool, paid to BSTONK's dividend distributor.",
    [LABEL.basketToBstonkHolders]: "Paid by the hook to the BSTONK basket vault as a payee on launches.",
    [LABEL.bstonkBurn]: "BSTONK the hook burnt from BSTONK's own pool: the launch token on buys, bought back on sells.",
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: "The platform's cut of the tax: half of it, capped at 1% of the trade, paid to the treasury.",
    [LABEL.sweptToTreasury]: "The part of the creator's cut the launch's payee list left unplaced, swept to the treasury.",
  },
  HoldersRevenue: {
    [LABEL.toBstonkHolders]: "The creator cut of BSTONK's own pool, paid to BSTONK's dividend distributor.",
    [LABEL.basketToBstonkHolders]: "Paid by the hook to the BSTONK basket vault as a payee on launches.",
    [LABEL.bstonkBurn]: "BSTONK the hook burnt from BSTONK's own pool: the launch token on buys, bought back on sells.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The creator's cut after the treasury's sweep and BSTONK holders' share: creator wallets, the token's own holders, its burn and its liquidity wedge.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  pullHourly: true,
  doublecounted: true, // uni-v4
};

export default adapter;
