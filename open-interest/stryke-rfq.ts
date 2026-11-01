import { formatUnits } from 'ethers';
import { getPrices } from '@defillama/sdk/build/util/coins';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { chainConfig, legacySettlement } from '../options/stryke-rfq';

// Public frontend ABI: https://app.stryke.xyz/assets/structure-BdbkFK2k.js.
// FillRequested discovers series only; outstanding supply is read at the window end.
const requestEvent = 'event FillRequested((address maker,address taker,bytes32 market,uint64 optionExpiry,uint8 kind,uint256[] strikes,address cashToken,uint256 pricePerContract,uint256 markPrice,uint256 maxSize,uint256 nonce,uint64 deadline,uint8 side,address writer) quote,(bytes32 quoteHash,address taker,uint256 size,uint256 minSize,uint256 maxSlippage,uint256 maxFee,uint64 deadline) fill,bytes32 position,uint256 premium,uint256 slippage,uint256 fee,uint64 confirmBy)';
// Decode the stable prefix of Request; later versions append fields after position.
// This preserves the ORIGINAL position token even if a maker's routing is reassigned.
const requestState = 'function requests(address maker,uint256 quoteNonce) view returns (((address maker,address taker,bytes32 market,uint64 optionExpiry,uint8 kind,uint256[] strikes,address cashToken,uint256 pricePerContract,uint256 markPrice,uint256 maxSize,uint256 nonce,uint64 deadline,uint8 side,address writer) quote,address taker,(uint8 standard,address token,uint256 id,uint256 amount) position))';
const coins: Record<string, string> = {
  '0x4254430000000000000000000000000000000000000000000000000000000000': 'bitcoin',
  '0x4554480000000000000000000000000000000000000000000000000000000000': 'ethereum',
};

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  const config = chainConfig[options.chain];
  const active = config.deployments.filter(d => d.version > 0 && Date.parse(d.start) / 1000 < options.endTimestamp);
  const logs = active.length ? await options.getLogs({
    targets: active.map(d => d.address),
    eventAbi: requestEvent,
    fromBlock: config.fromBlock,
    flatten: false,
  }) : [];
  const candidates: { settlement: string; maker: string; nonce: string; coin: string; writer: string }[] = [];
  logs.forEach((group: any[], index: number) => {
    for (const log of group) {
      if (Number(log.quote.optionExpiry) <= options.endTimestamp || Number(log.quote.side) !== 0) continue;
      const coin = coins[log.quote.market.toLowerCase()];
      if (!coin) throw new Error('Unknown Stryke underlying; extend the reviewed pricing mapping');
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
    const created = await options.getLogs({ target: legacySettlement, fromBlock: 79843602,
      eventAbi: 'event OptionCreated(uint256 indexed id,address indexed writer,bytes32 market,uint64 expiry,uint8 kind,uint256[] strikes,address cashToken,bool collateralized)' });
    for (const log of created) {
      if (Number(log.expiry) <= options.endTimestamp) continue;
      const coin = coins[log.market.toLowerCase()];
      if (!coin) throw new Error('Unknown legacy Stryke underlying');
      const id = log.id.toString();
      bySeries.set(legacySettlement + ':' + id, { target: legacySettlement, id, coin, writer: log.writer });
    }
  }
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
  // Position quantities use 8 decimals for both BTC and ETH. Do not sum filled
  // quantities: redemptions burn supply and sales may return inventory to the writer.
  // Balances' automatic pricing substitutes current prices for recent windows.
  // Fetch dated prices explicitly so OI quantity and valuation share a cutoff.
  const live = series.map((s, i) => {
    const outstanding = BigInt(supplies[i]) - BigInt(writerInventory[i]);
    if (outstanding < 0n) throw new Error('Writer inventory exceeds Stryke issued supply');
    return { ...s, amount: Number(formatUnits(outstanding, 8)) };
  }).filter(s => s.amount > 0);
  const prices = await getPrices([...new Set(live.map(s => 'coingecko:' + s.coin))], options.toTimestamp);
  for (const s of live) {
    const price = prices['coingecko:' + s.coin]?.price;
    if (!Number.isFinite(price) || price <= 0) throw new Error('Missing Stryke OI snapshot price');
    openInterestAtEnd.addUSDValue(s.amount * price, 'Outstanding Options Notional');
  }
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // Snapshot at the end of the window; never sum hourly OI snapshots.
  adapter: chainConfig,
  fetch,
  methodology: {
    OpenInterest: 'Outstanding supply, excluding writer-held buybacks, of unexpired Stryke RFQ BTC and ETH option series, counted once on the position chain and valued at the underlying price at the window end; excludes external hedge positions and is not capital at risk.',
  },
  breakdownMethodology: {
    OpenInterest: { 'Outstanding Options Notional': 'Unexpired series supply less writer inventory, in eight-decimal underlying units, priced as BTC or ETH. Refund-only series have zero supply.' },
  },
};

export default adapter;
