import { formatUnits } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { chainConfig, legacySettlement } from '../options/stryke-rfq';

// Public frontend ABI: https://app.stryke.xyz/assets/structure-BdbkFK2k.js.
// FillRequested discovers series only; outstanding supply is read at the window end.
const requestEvent = 'event FillRequested((address maker,address taker,bytes32 market,uint64 optionExpiry,uint8 kind,uint256[] strikes,address cashToken,uint256 pricePerContract,uint256 markPrice,uint256 maxSize,uint256 nonce,uint64 deadline,uint8 side,address writer) quote,(bytes32 quoteHash,address taker,uint256 size,uint256 minSize,uint256 maxSlippage,uint256 maxFee,uint64 deadline) fill,bytes32 position,uint256 premium,uint256 slippage,uint256 fee,uint64 confirmBy)';
// Decode the stable prefix of Request; later versions append fields after position.
// This preserves the ORIGINAL position token even if a maker's routing is reassigned.
const requestState = 'function requests(address maker,uint256 quoteNonce) view returns (((address maker,address taker,bytes32 market,uint64 optionExpiry,uint8 kind,uint256[] strikes,address cashToken,uint256 pricePerContract,uint256 markPrice,uint256 maxSize,uint256 nonce,uint64 deadline,uint8 side,address writer) quote,address taker,(uint8 standard,address token,uint256 id,uint256 amount) position))';
// CoinGecko id per underlying (market = bytes32 ticker). Gold and stocks use 1:1 tokenized
// versions (PAXG = 1 troy oz; METAx / SPCXx xStocks = 1 share). Markets without a price source
// (CL as of November 2026) are skipped and logged.
const coins: Record<string, string> = {
  '0x4254430000000000000000000000000000000000000000000000000000000000': 'bitcoin', // BTC
  '0x4554480000000000000000000000000000000000000000000000000000000000': 'ethereum', // ETH
  '0x4859504500000000000000000000000000000000000000000000000000000000': 'hyperliquid', // HYPE
  '0x5a45430000000000000000000000000000000000000000000000000000000000': 'zcash', // ZEC
  '0x534f4c0000000000000000000000000000000000000000000000000000000000': 'solana', // SOL
  '0x5841550000000000000000000000000000000000000000000000000000000000': 'pax-gold', // XAU
  '0x4d45544100000000000000000000000000000000000000000000000000000000': 'meta-xstock', // META
  '0x5350435800000000000000000000000000000000000000000000000000000000': 'spacex-xstocks', // SPCX
};
const ticker = (market: string) => Buffer.from(market.slice(2), 'hex').toString().replace(/\0+$/, '');

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  const config = chainConfig[options.chain];
  const active = config.deployments.filter(d => d.version > 0 && Date.parse(d.start) / 1000 < options.endTimestamp);
  const logs = active.length ? await options.getLogs({
    targets: active.map(d => d.address),
    eventAbi: requestEvent,
    fromBlock: config.fromBlock,
    flatten: false,
    cacheInCloud: true,
  }) : [];
  const candidates: { settlement: string; maker: string; nonce: string; coin: string; writer: string }[] = [];
  const unpriced = new Set<string>();
  logs.forEach((group: any[], index: number) => {
    for (const log of group) {
      if (Number(log.quote.optionExpiry) <= options.endTimestamp || Number(log.quote.side) !== 0) continue;
      const coin = coins[log.quote.market.toLowerCase()];
      if (!coin) { unpriced.add(ticker(log.quote.market)); continue; }
      candidates.push({ settlement: active[index].address, maker: log.quote.maker, nonce: log.quote.nonce.toString(), coin, writer: log.quote.writer && !/^0x0{40}$/i.test(log.quote.writer) ? log.quote.writer : log.quote.maker });
    }
  });
  const requests = await options.toApi.multiCall({
    abi: requestState,
    calls: candidates.map(c => ({ target: c.settlement, params: [c.maker, c.nonce] })),
  });
  const bySeries = new Map<string, { target: string; id: string; coin: string; writer: string }>();
  candidates.forEach((c, i) => {
    const position = requests[i].position ?? requests[i][2];
    const target = position.token ?? position[1];
    if (!target) throw new Error('Invalid Stryke request position');
    // An unanswered/refunded request has no issued position and contributes no OI.
    if (/^0x0{40}$/i.test(target)) return;
    const id = String(position.id ?? position[2]);
    const key = target.toLowerCase() + ':' + id;
    if (bySeries.has(key) && bySeries.get(key)!.coin !== c.coin) throw new Error('Inconsistent Stryke series underlying');
    bySeries.set(key, { target, id, coin: c.coin, writer: c.writer });
  });
  if (options.chain === 'robinhood') {
    // The October 4 implementation issues ERC6909 positions itself.
    const created = await options.getLogs({ target: legacySettlement, fromBlock: 79843602, cacheInCloud: true,
      eventAbi: 'event OptionCreated(uint256 indexed id,address indexed writer,bytes32 market,uint64 expiry,uint8 kind,uint256[] strikes,address cashToken,bool collateralized)' });
    for (const log of created) {
      if (Number(log.expiry) <= options.endTimestamp) continue;
      const coin = coins[log.market.toLowerCase()];
      if (!coin) { unpriced.add(ticker(log.market)); continue; }
      const id = log.id.toString();
      bySeries.set(legacySettlement + ':' + id, { target: legacySettlement, id, coin, writer: log.writer });
    }
  }
  if (unpriced.size) console.log(`stryke-rfq ${options.chain}: OI excludes open series on unpriced underlyings ${[...unpriced].join(', ')}`);
  const series = [...bySeries.values()];
  const supplies = await options.toApi.multiCall({
    abi: 'function totalSupply(uint256) view returns (uint256)',
    calls: series.map(s => ({ target: s.target, params: [s.id] })),
  });
  const writerInventory = await options.toApi.multiCall({
    abi: 'function balanceOf(address,uint256) view returns (uint256)',
    calls: series.map(s => ({ target: s.target, params: [s.writer, s.id] })),
  });
  // Positions sold back can remain minted in the writer wallet. They are closed
  // customer exposure, so subtract writer inventory from issued supply.
  // Position quantities use 8 decimals on every market. Do not sum filled
  // quantities: redemptions burn supply and sales may return inventory to the writer.
  series.forEach((s, i) => {
    const outstanding = BigInt(supplies[i]) - BigInt(writerInventory[i]);
    if (outstanding < 0n) throw new Error('Writer inventory exceeds Stryke issued supply');
    if (outstanding > 0n) openInterestAtEnd.addCGToken(s.coin, Number(formatUnits(outstanding, 8)));
  });
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // Snapshot at the end of the window; never sum hourly OI snapshots.
  adapter: chainConfig,
  fetch,
  methodology: {
    OpenInterest: 'Outstanding supply, excluding writer-held buybacks, of unexpired Stryke RFQ option series on BTC, ETH, HYPE, ZEC, SOL, gold, META and SpaceX, counted once on the position chain and valued at the underlying price at the window end (gold, META and SpaceX via their PAXG, METAx and SPCXx tokenized versions); excludes underlyings without a price source (crude oil), external hedge positions, and is not capital at risk.',
  },
};

export default adapter;
