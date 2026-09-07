import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
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
  // the block the first launcher went live; the launch map is read from here
  launchGenesisBlock: number;
  launchers: string[];
  hooks: string[];
  // BSTONK's own value-accrual recipients - Base only, BSTONK lives on Base
  holderRecipients?: { bstonk: string; tracker: string; vaults: string[] };
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    // first launch (BSTONK itself), block 50069724, 2026-08-17 01:06 UTC
    start: "2026-08-17",
    // https://basescan.org/address/0x498581fF718922c3f8e6A244956aF099B2652b2b
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    launchGenesisBlock: 50069724,
    // every launcher generation; a retired one still serves its pools
    launchers: [
      "0x74655f443d25c5d401a582c68dea02acd170e12f", // v2
      "0xde15bf7592970e2458239a308cdf727e8780c62a", // v3
      "0x5263e7264c817909893aa9a00dc2f4b433040fc1", // v4
      "0xf505085d8db742fc0053897ac7b9b1fa6b64d3eb", // v5
      "0x1b6cec29f67f17e484363bb9343d3f38c6a1003e", // v5
      "0xae31b51460da9c7cbf906cbaf39ba55e47c3de42", // v5
      "0x80459e17ec8269f058152169e58022a70ed9f1fa", // v6
      "0x7dea3db7988f0c70e6d51920bae8cafbe943e6d5", // B20 v1 (Coinbase-issued stock pairs)
      "0x445f7d3533f956fe25eaf55ebadf3d2ade153151", // B20 v6
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
      // the basket vaults, paid as a payee on launches, paying BSTONK holders
      // in rounds
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
    launchGenesisBlock: 54058114,
    // https://robinhoodchain.blockscout.com/address/0x302BdDA741dff12c298F68eDc67b4fA830a1f6A4
    launchers: ["0x302bdda741dff12c298f68edc67b4fa830a1f6a4"],
    // https://robinhoodchain.blockscout.com/address/0xF42bC6ca0D082D3Af51771392CeC847a01A6e044
    hooks: ["0xf42bc6ca0d082d3af51771392cec847a01a6e044"], // v6
  },
};

// Launch events. Two shapes are live: the v2-v5 and B20 launchers emit the
// first, the v6 launchers (Base and Robinhood) the second. Both carry the
// token, the pool id and the pair, which is all the map needs.
const launchedV2Abi =
  "event AdvancedLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, address pairToken, uint160 sqrtPriceX96, uint16 taxBps, uint16 burnBps, uint16 liquidityBps, uint256 payees)";
const launchedV6Abi =
  "event AdvancedLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, address pairToken, uint160 sqrtPriceX96, uint16 buyTaxBps, uint16 sellTaxBps, uint16 burnBps, uint16 liquidityBps, uint256 payees)";

// Hook events. Same signatures on every generation.
const feeTakenAbi = "event FeeTaken(bytes32 indexed id, address currency, uint256 platform, uint256 creator)";
const remainderSweptAbi = "event RemainderSwept(bytes32 indexed id, address currency, uint256 amount)";

// PoolManager Swap - the price every token-denominated amount is converted at
const swapAbi =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const transferAbi = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// where the hook sends what it burns
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

const run = async (options: FetchOptions, volumeOnly = false): Promise<FetchResultV2> => {
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

  // 1. the launch map: pool id -> token and pair, read once from every
  //    launcher since the first went live and carried forward by the cache.
  const launches = new Map<string, Launch>();
  const poolOfToken = new Map<string, string>();
  for (const eventAbi of [launchedV2Abi, launchedV6Abi]) {
    const logs = await getLogs({
      targets: config.launchers,
      eventAbi,
      fromBlock: config.launchGenesisBlock,
      cacheInCloud: true,
    });
    for (const log of logs) {
      const token = low(log.token);
      const pair = low(log.pairToken);
      const id = low(log.poolId);
      launches.set(id, { token, pair, tokenIs0: token < pair });
      poolOfToken.set(token, id);
    }
  }

  // 2. what the hooks took. Every FeeTaken is one taxed swap; the pool id
  //    says which launch, the currency says whether it was a buy (launch
  //    token) or a sell (pair).
  const feeLogs = await getLogs({ targets: hooks, eventAbi: feeTakenAbi, ...logOptions });
  const sweptLogs = await getLogs({ targets: hooks, eventAbi: remainderSweptAbi, ...logOptions });

  // 3. the swaps of every pool that was taxed in the window, keyed by
  //    transaction, ordered by log index. One request per active pool with the
  //    pool id as the indexed topic rather than every Swap the PoolManager
  //    emitted - the v4 singleton on Base carries every pool on the chain.
  const activePools = [...new Set<string>([...feeLogs, ...sweptLogs].map((l: any) => low(l.args.id)))]
    .filter((id) => launches.has(id)); // an unknown pool is reported when its fee is booked
  const swapLogs = await Promise.all(
    activePools.map((id) => getLogs({ target: config.poolManager, eventAbi: swapAbi, topics: [SWAP_TOPIC, id], ...logOptions })),
  );
  const swapsByPool = new Map<string, Map<string, SwapLog[]>>();
  activePools.forEach((id, i) => {
    const byTx = new Map<string, SwapLog[]>();
    for (const log of swapLogs[i]) {
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
    for (const row of byTx.values()) row.sort((a, b) => a.logIndex - b.logIndex);
    swapsByPool.set(id, byTx);
  });

  // The hook emits its events from afterSwap, so the Swap a fee belongs to is
  // the nearest one before it in the same transaction and pool. Its
  // sqrtPriceX96 is the pool's price at that moment: currency1 per currency0,
  // as (sqrtPriceX96 / 2^96)^2.
  const priceIn = (id: string, tx: string, logIndex: number): bigint | undefined => {
    const row = swapsByPool.get(id)?.get(tx);
    if (!row?.length) return undefined;
    let pick: SwapLog | undefined;
    for (const s of row) if (s.logIndex < logIndex) pick = s;
    return pick?.sqrtPriceX96;
  };

  // Book an amount in a currency that has a market: a pair-denominated amount
  // as it is, a token-denominated amount converted into the pair at the
  // transaction's pool price. An amount this adapter cannot place is logged
  // and left out rather than guessed at - the launch map or the swap lookup
  // is what to fix.
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
    // token is currency0: pair per token is the price; token is currency1: its inverse
    return [launch.pair, launch.tokenIs0 ? (amount * p2) / Q192 : (amount * Q192) / p2];
  };

  // 4. book the tax. Fees is the whole of it; the platform's cut is treasury
  //    revenue; the creator's cut is held back and split below.
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
    // split the priced total in the event's own proportion rather than
    // converting twice, so the two parts sum to exactly what was booked
    const platformPriced = platform + creator === 0n ? 0n : (total * platform) / (platform + creator);
    dailyFees.add(currency, total, LABEL.swapFees);
    dailyProtocolRevenue.add(currency, platformPriced, LABEL.toTreasury);
    put(creatorCut, currency, total - platformPriced);
  }

  // 5. what the creator's cut did not place and the hook swept to the
  //    treasury - also revenue, taken out of the creator's cut.
  const swept: Ledger = new Map();
  for (const log of sweptLogs) {
    const id = low(log.args.id);
    const priced = toPair(id, low(log.args.currency), big(log.args.amount), low(log.transactionHash), Number(log.logIndex));
    if (!priced) continue;
    const [currency, amount] = priced;
    dailyProtocolRevenue.add(currency, amount, LABEL.sweptToTreasury);
    put(swept, currency, amount);
  }

  // 6. what reached BSTONK holders (Base only), in the transaction the fee was
  //    taken: the hook pays BSTONK's dividend distributor and the basket vault
  //    as payees through the PoolManager, and burns BSTONK from BSTONK's own
  //    pool. A launch distributor also forwards part of its holders' stream to
  //    the vault later, in basket assets; that value was booked supply-side on
  //    its fee day and is deliberately not counted again here, so that
  //    Fees = Revenue + SupplySideRevenue holds within the period.
  const heldBack: Ledger = new Map();
  const recipients = config.holderRecipients;
  if (recipients && !volumeOnly) {
    // A launch token arriving as a payout is priced at its pool when its own
    // pool swapped earlier in the same transaction - a buy's fee, paid in the
    // token. Otherwise it arrived as the PAIR of some other pool (BSTONK is
    // the pair of most launches, and a route through BSTONK's own pool comes
    // later in the transaction) and is booked as it is, a currency with a
    // market.
    const priceTransfer = (log: any): [string, bigint] => {
      const token = low(log.address);
      const amount = big(log.args.value);
      const tx = low(log.transactionHash);
      const logIndex = Number(log.logIndex);
      const id = poolOfToken.get(token);
      if (!id || priceIn(id, tx, logIndex) === undefined) return [token, amount];
      return toPair(id, token, amount, tx, logIndex) ?? [token, amount];
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
        const [currency, amount] = priceTransfer(log);
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
      const [currency, amount] = priceTransfer(log);
      dailyHoldersRevenue.add(currency, amount, LABEL.bstonkBurn);
      put(heldBack, currency, amount);
    }
  }

  // 7. the creator's cut less what the treasury swept and what BSTONK holders
  //    were paid is supply-side: creator wallets, each token's own holders,
  //    its burn and its liquidity wedge. The three legs come out of the same
  //    events, so the residual cannot go negative; if it does, something above
  //    is double-counted and the shortfall is reported rather than hidden.
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

  // 8. volume: the pair side of every swap in a taxed pool, the launcher's own
  //    dev buy included, the hook's buyback and wedge swaps excluded.
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

const fetch = (options: FetchOptions) => run(options);
// the volume adapter needs the launch map and the swaps, not the attribution
export const fetchVolume = (options: FetchOptions) => run(options, true);

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
