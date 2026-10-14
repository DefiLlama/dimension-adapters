import { FetchOptions } from "../adapters/types";

// PFWA Markets (https://pfwa.fun, https://x.com/pfwafun): prediction markets on Robinhood Chain. Every outcome of a
// market is its own bonding-curve ERC-20 (an EIP-1167 clone of BondingCurveToken) deployed by a PFWAMarketFactory, and
// every trade is an event of that outcome token. Sources are verified on Sourcify (chain 4663):
//   v1 factory 0x2502aB7E69dDb3157683A82E603360Ada9B6E647, outcome token implementation 0x3e90a0217e4fbbf9567f175d74a123a5769bc845
//   v2 factory 0x7B38e940Cd649bc0C701c42eE1A6ceff75584afa, outcome token implementation 0x913d53e2fc37f3b4a2b67ee7c089b827054455b8
// Shared by the pfwa-markets adapters (dexs, fees, open-interest, active-users).
// firstBlock: the block of the factory's first market. Windows ending before it skip the factory, which may not exist yet.
export const PFWA_MARKET_FACTORIES: { factory: string; version: 1 | 2; firstBlock: number }[] = [
  { factory: "0x2502aB7E69dDb3157683A82E603360Ada9B6E647", version: 1, firstBlock: 24074745 }, // 2026-07-31
  { factory: "0x7B38e940Cd649bc0C701c42eE1A6ceff75584afa", version: 2, firstBlock: 50512948 }, // 2026-08-31
];

// Wallets PFWA itself trades and creates markets from. Their buys, sells and paid market creations are the protocol's
// own activity (seeding liquidity, market making, testing), so they are left out of volume, fees and users. Listed as
// protocol-operated wallets in the pfwa.fun frontend (lib/adminWallets.ts).
export const PFWA_PROTOCOL_WALLETS = new Set([
  "0x420944b441715e34dd672ae0eb4526a7ad7d1eef", // team wallet, owner of both factories
  "0x4f77c413e6b2c6463812efaa2033373c075cd7d9", // relayer / resolver bot, which also seeds new markets
  "0x4fd671bf39ad6d2423cbff59af80ebfb3234c3ef", // market-making agent
  "0x5ec7a4c18f67ffc371dd941b486923b22592fe56", // orchestrator agent
]);

export const PFWA_EVENTS = {
  buy: "event TokensBought(uint256 indexed marketId, uint256 indexed optionId, address indexed buyer, uint256 ethPaid, uint256 tokenAmount)",
  sell: "event TokensSold(uint256 indexed marketId, uint256 indexed optionId, address indexed seller, uint256 ethReceived, uint256 tokenAmount)",
  claim: "event WinningsClaimed(uint256 indexed marketId, uint256 indexed optionId, address indexed claimant, uint256 ethReceived, uint256 tokensBurned)",
  // emitted by every buy right after TokensBought, with the two fee legs it paid (sells emit no fee event)
  feeDistributed: "event FeeDistributed(uint256 indexed marketId, uint256 indexed optionId, uint256 creatorFee, uint256 platformFee, string action)",
};

type Uint = bigint | string | number;
export type PfwaBuyArgs = { marketId: Uint; optionId: Uint; buyer: string; ethPaid: Uint; tokenAmount: Uint };
export type PfwaSellArgs = { marketId: Uint; optionId: Uint; seller: string; ethReceived: Uint; tokenAmount: Uint };
export type PfwaClaimArgs = { marketId: Uint; optionId: Uint; claimant: string; ethReceived: Uint; tokensBurned: Uint };
export type PfwaFeeArgs = { marketId: Uint; optionId: Uint; creatorFee: Uint; platformFee: Uint; action: string };

/** A log as `options.getLogs` returns it with `entireLog: true`. `args` is missing when the log did not decode. */
type RawLog<A> = { address: string; transactionHash: string; blockNumber: number | string; args?: A };

export type PfwaMarketToken = { factory: string; version: 1 | 2; marketId: number };

/** An outcome-token event that decoded and was emitted by one of the factories' outcome tokens. */
export type PfwaTokenLog<A> = { token: string; info: PfwaMarketToken; transactionHash: string; blockNumber: number; args: A };

/**
 * The factories that exist by the end of the window (`firstBlock` <= the window's end block). Reading a factory before
 * it was deployed reverts, so windows that end earlier skip it.
 */
export async function getPfwaLiveFactories(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  return PFWA_MARKET_FACTORIES.filter(({ firstBlock }) => toBlock >= firstBlock);
}

/**
 * Every outcome token of every market, keyed by lowercase address, as listed by the live factories at the end of the
 * window (`marketCount`, `getOptionTokenAddresses` read at the window's end block). The lists only grow, so this covers
 * every token that can emit an event inside the window.
 */
export async function getPfwaMarketTokens(options: FetchOptions): Promise<Record<string, PfwaMarketToken>> {
  const tokens: Record<string, PfwaMarketToken> = {};
  const factories = await getPfwaLiveFactories(options);
  const counts: Uint[] = await options.api.multiCall({ abi: "uint256:marketCount", calls: factories.map(({ factory }) => factory) });
  for (let i = 0; i < factories.length; i++) {
    const { factory, version } = factories[i];
    const ids = Array.from({ length: Number(counts[i]) }, (_, id) => id);
    const lists: string[][] = await options.api.multiCall({ target: factory, abi: "function getOptionTokenAddresses(uint256) view returns (address[])", calls: ids });
    lists.forEach((list, marketId) => list.forEach((token) => (tokens[token.toLowerCase()] = { factory, version, marketId })));
  }
  return tokens;
}

/**
 * One outcome-token event over the window, kept only when it was emitted by one of `tokens` and decoded. There are
 * hundreds of outcome tokens, so the event is fetched by topic (`noTarget`) instead of by target. Anyone can emit a
 * look-alike event, and other contracts may use the same topic with other indexed fields: those logs are dropped.
 * `parseLog` is left unset on purpose: with `entireLog` the SDK then returns logs that fail to decode without `args`
 * instead of throwing, and they are filtered out here.
 */
export async function getPfwaTokenLogs<A>(options: FetchOptions, eventAbi: string, tokens: Record<string, PfwaMarketToken>): Promise<PfwaTokenLog<A>[]> {
  const logs: RawLog<A>[] = await options.getLogs({ eventAbi, noTarget: true, entireLog: true });
  const out: PfwaTokenLog<A>[] = [];
  for (const log of logs) {
    const token = String(log.address).toLowerCase();
    const info = tokens[token];
    if (!info || !log.args) continue;
    out.push({ token, info, transactionHash: String(log.transactionHash).toLowerCase(), blockNumber: Number(log.blockNumber), args: log.args });
  }
  return out;
}

export type PfwaBuy = { token: string; info: PfwaMarketToken; trader: string; blockNumber: number; ethPaid: bigint; creatorFee: bigint; platformFee: bigint };
export type PfwaSell = { token: string; info: PfwaMarketToken; trader: string; blockNumber: number; ethReceived: bigint };

/**
 * The window's buys and sells on PFWA outcome tokens (see getPfwaTokenLogs for how they are found), each buy with the
 * two fee legs it paid. A buy emits TokensBought then FeeDistributed("buy") from the same outcome token in the same
 * transaction, so the n-th of each are paired per (transaction, token). Trades by PFWA_PROTOCOL_WALLETS are dropped
 * unless `includeProtocolWallets` is set. Claims of winnings (WinningsClaimed) are not trades and are not read.
 */
export async function getPfwaMarketTrades(options: FetchOptions, { includeProtocolWallets = false } = {}) {
  const tokens = await getPfwaMarketTokens(options);
  const [buyLogs, sellLogs, feeLogs] = await Promise.all([
    getPfwaTokenLogs<PfwaBuyArgs>(options, PFWA_EVENTS.buy, tokens),
    getPfwaTokenLogs<PfwaSellArgs>(options, PFWA_EVENTS.sell, tokens),
    getPfwaTokenLogs<PfwaFeeArgs>(options, PFWA_EVENTS.feeDistributed, tokens),
  ]);
  const txKey = (log: PfwaTokenLog<unknown>) => `${log.transactionHash}-${log.token}`;

  const feesByTx: Record<string, PfwaFeeArgs[]> = {};
  for (const log of feeLogs) {
    if (log.args.action !== "buy") continue;
    (feesByTx[txKey(log)] = feesByTx[txKey(log)] || []).push(log.args);
  }

  const buys: PfwaBuy[] = [];
  for (const log of buyLogs) {
    const fee = (feesByTx[txKey(log)] || []).shift();
    if (!fee) throw new Error(`PFWA Markets: no FeeDistributed for the buy in ${log.transactionHash}`);
    const trader = String(log.args.buyer).toLowerCase();
    if (!includeProtocolWallets && PFWA_PROTOCOL_WALLETS.has(trader)) continue;
    buys.push({ token: log.token, info: log.info, trader, blockNumber: log.blockNumber, ethPaid: BigInt(log.args.ethPaid), creatorFee: BigInt(fee.creatorFee), platformFee: BigInt(fee.platformFee) });
  }

  const sells: PfwaSell[] = [];
  for (const log of sellLogs) {
    const trader = String(log.args.seller).toLowerCase();
    if (!includeProtocolWallets && PFWA_PROTOCOL_WALLETS.has(trader)) continue;
    sells.push({ token: log.token, info: log.info, trader, blockNumber: log.blockNumber, ethReceived: BigInt(log.args.ethReceived) });
  }

  return { tokens, buys, sells };
}
