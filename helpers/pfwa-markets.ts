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

export async function getPfwaLiveFactories(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  return PFWA_MARKET_FACTORIES.filter(({ firstBlock }) => toBlock >= firstBlock);
}

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
  // emitted by every buy right after TokensBought, with the two fee legs it paid (sells emit no fee event)
  feeDistributed: "event FeeDistributed(uint256 indexed marketId, uint256 indexed optionId, uint256 creatorFee, uint256 platformFee, string action)",
};

export type PfwaMarketToken = { factory: string; version: 1 | 2; marketId: number };

// Every outcome token of every market, read from the factories at the end of the window.
export async function getPfwaMarketTokens(options: FetchOptions): Promise<Record<string, PfwaMarketToken>> {
  const tokens: Record<string, PfwaMarketToken> = {};
  const factories = await getPfwaLiveFactories(options);
  const counts = await options.api.multiCall({ abi: "uint256:marketCount", calls: factories.map(({ factory }) => factory) });
  for (let i = 0; i < factories.length; i++) {
    const { factory, version } = factories[i];
    const ids = Array.from({ length: Number(counts[i]) }, (_, id) => id);
    const lists: string[][] = await options.api.multiCall({ target: factory, abi: "function getOptionTokenAddresses(uint256) view returns (address[])", calls: ids });
    lists.forEach((list, marketId) => list.forEach((token) => (tokens[token.toLowerCase()] = { factory, version, marketId })));
  }
  return tokens;
}

export type PfwaBuy = { token: string; info: PfwaMarketToken; trader: string; ethPaid: bigint; creatorFee: bigint; platformFee: bigint };
export type PfwaSell = { token: string; info: PfwaMarketToken; trader: string; ethReceived: bigint; blockNumber: number };

// The window's buys and sells on PFWA outcome tokens, each buy with the fees it paid. There are hundreds of outcome
// tokens, so the events are fetched by topic and kept only when the emitter is one of the factories' tokens (anyone
// can emit a look-alike event). Claims of winnings (WinningsClaimed) are not trades and are not read.
export async function getPfwaMarketTrades(options: FetchOptions, { includeProtocolWallets = false } = {}) {
  const tokens = await getPfwaMarketTokens(options);
  const [buyLogs, sellLogs, feeLogs] = await Promise.all(
    [PFWA_EVENTS.buy, PFWA_EVENTS.sell, PFWA_EVENTS.feeDistributed].map((eventAbi) =>
      // other contracts on the chain may emit an event with the same topic but other indexed fields: those fail to
      // decode and are dropped below with every other log that is not from an outcome token
      options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true, allowParseFailure: true } as any)
    )
  );
  const ours = (log: any) => log.args && tokens[String(log.address).toLowerCase()];
  const txKey = (log: any) => `${String(log.transactionHash).toLowerCase()}-${String(log.address).toLowerCase()}`;

  // a buy emits TokensBought then FeeDistributed("buy") from the same outcome token in the same transaction: pair the
  // n-th of each per (transaction, token)
  const feesByTx: Record<string, any[]> = {};
  for (const log of feeLogs) {
    if (!ours(log) || log.args.action !== "buy") continue;
    (feesByTx[txKey(log)] = feesByTx[txKey(log)] || []).push(log.args);
  }

  const buys: PfwaBuy[] = [];
  for (const log of buyLogs) {
    const info = ours(log);
    if (!info) continue;
    const fee = (feesByTx[txKey(log)] || []).shift();
    if (!fee) throw new Error(`PFWA Markets: no FeeDistributed for the buy in ${log.transactionHash}`);
    const trader = String(log.args.buyer).toLowerCase();
    if (!includeProtocolWallets && PFWA_PROTOCOL_WALLETS.has(trader)) continue;
    buys.push({ token: String(log.address).toLowerCase(), info, trader, ethPaid: BigInt(log.args.ethPaid), creatorFee: BigInt(fee.creatorFee), platformFee: BigInt(fee.platformFee) });
  }

  const sells: PfwaSell[] = [];
  for (const log of sellLogs) {
    const info = ours(log);
    if (!info) continue;
    const trader = String(log.args.seller).toLowerCase();
    if (!includeProtocolWallets && PFWA_PROTOCOL_WALLETS.has(trader)) continue;
    sells.push({ token: String(log.address).toLowerCase(), info, trader, ethReceived: BigInt(log.args.ethReceived), blockNumber: Number(log.blockNumber) });
  }

  return { tokens, buys, sells };
}
