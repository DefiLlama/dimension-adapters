import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// HedgeHood Options: cash-settled European options on Robinhood Chain stock tokens, one CashOptionMarketV2 (margin,
// positions, settlement, all in USDG) and one CashOptionOrderBookV2 (signed orders and RFQ quotes) per underlying.
// Traders are AI agents and the hedgehood.io/options desk. Deployed 2026-10-29.
// https://sourcify.dev/server/v2/contract/4663/0x99AfB93D21B4369207f090f80Fad6551b5316163
const MARKETS = [
  { market: '0x99AfB93D21B4369207f090f80Fad6551b5316163', underlying: ADDRESSES.robinhood.NVDA },
  { market: '0x205E146a5Bfc4213399a6e01D347ac1F443bb1Ab', underlying: ADDRESSES.robinhood.TSLA },
  { market: '0x6bc821D2E305C0486f1a2c40A4CaBA67F32E9Fce', underlying: ADDRESSES.robinhood.MU },
  { market: '0xF00Db795444EE30ad3dBE836BCd82A5f18D39Afd', underlying: ADDRESSES.robinhood.GOOGL },
  { market: '0x348dc1b94099CfbFf5A142f78a41542a42f4b2C7', underlying: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5' }, // CRCL
  { market: '0x39B338A02B33766C56C91049A5965ba7694754DF', underlying: ADDRESSES.robinhood.MSTR },
  { market: '0x4698Dd37664ade58c173FFd10C3A4DCE6d33241D', underlying: ADDRESSES.robinhood.AMD },
];
const DEPLOYMENT_BLOCK = 101263991; // 2026-10-29, the first market
const USDG = ADDRESSES.robinhood.USDG;
const FEE_LABEL = 'Trading fees on option premiums';

const ABI = {
  // one per fill, whichever path it took (a taker's fill of a signed order, or two orders matched)
  traded: 'event Traded(address indexed buyer, address indexed seller, uint256 indexed instrumentId, uint256 quantity)',
  // the premium leg of the same fill: the buyer pays sellerGets + fee, the fee is credited to the fee recipient
  premiumSettled: 'event PremiumSettled(address indexed buyer, address indexed seller, uint256 sellerGets, uint256 fee, bool buyerFromBalance, bool sellerFromBalance)',
};

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const [firstBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  if (!Number.isInteger(firstBlock) || !Number.isInteger(toBlock)) throw new Error('HedgeHood Options: block lookup failed');
  const fromBlock = Math.max(firstBlock, DEPLOYMENT_BLOCK);
  if (fromBlock <= toBlock) {
    const targets = MARKETS.map(({ market }) => market);
    const [fills, premiums] = await Promise.all([
      options.getLogs({ targets, eventAbi: ABI.traded, fromBlock, toBlock, flatten: false }),
      options.getLogs({ targets, eventAbi: ABI.premiumSettled, fromBlock, toBlock }),
    ]);
    fills.forEach((marketFills: any[], i: number) => {
      for (const fill of marketFills) dailyNotionalVolume.add(MARKETS[i].underlying, fill.quantity);
    });
    for (const premium of premiums) {
      dailyPremiumVolume.add(USDG, BigInt(premium.sellerGets) + BigInt(premium.fee));
      dailyFees.add(USDG, BigInt(premium.fee), FEE_LABEL);
    }
  }
  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-29',
  fetch,
  methodology: {
    NotionalVolume: 'The shares of the underlying stock in each fill (Traded.quantity), valued at the stock token price. Every fill is counted once, whether a taker filled a signed order or two orders were matched.',
    PremiumVolume: 'What the buyer pays in USDG for each fill (PremiumSettled.sellerGets + fee).',
    Fees: "The trading fee on each fill's premium (0.05% of the premium, paid by the taker), plus the price improvement kept when two crossing orders are matched. It is credited to the protocol's fee recipient inside the market at the fill (PremiumSettled.fee). The market makers' spread and the options' settlement payouts are not fees.",
    UserFees: "The trading fee traders pay on each fill's premium (0.05% of the premium, paid by the taker), plus the price improvement kept when two crossing orders are matched.",
    Revenue: 'All trading fees on option premiums go to the protocol (the FeeSweeper forwards them to the HedgeHood options Safe).',
    ProtocolRevenue: 'All trading fees on option premiums go to the protocol (the FeeSweeper forwards them to the HedgeHood options Safe).',
  },
  breakdownMethodology: {
    Fees: { [FEE_LABEL]: 'PremiumSettled.fee of every fill on the seven markets, in USDG.' },
    UserFees: { [FEE_LABEL]: 'PremiumSettled.fee of every fill on the seven markets, in USDG.' },
    Revenue: { [FEE_LABEL]: 'PremiumSettled.fee of every fill, credited to the protocol fee recipient.' },
    ProtocolRevenue: { [FEE_LABEL]: 'PremiumSettled.fee of every fill, credited to the protocol fee recipient.' },
  },
};

export default adapter;
