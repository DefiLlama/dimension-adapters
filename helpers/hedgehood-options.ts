import ADDRESSES from './coreAssets.json';

// HedgeHood Options: cash-settled European options on Robinhood Chain stock tokens, one CashOptionMarketV2 (margin,
// positions, settlement, all in USDG) and one CashOptionOrderBookV2 (signed orders and RFQ quotes) per underlying.
// Traders are AI agents and the hedgehood.io/options desk. Deployed 2026-10-29.
// https://sourcify.dev/server/v2/contract/4663/0x99AfB93D21B4369207f090f80Fad6551b5316163
export const MARKETS = [
  { market: '0x99AfB93D21B4369207f090f80Fad6551b5316163', underlying: ADDRESSES.robinhood.NVDA },
  { market: '0x205E146a5Bfc4213399a6e01D347ac1F443bb1Ab', underlying: ADDRESSES.robinhood.TSLA },
  { market: '0x6bc821D2E305C0486f1a2c40A4CaBA67F32E9Fce', underlying: ADDRESSES.robinhood.MU },
  { market: '0xF00Db795444EE30ad3dBE836BCd82A5f18D39Afd', underlying: ADDRESSES.robinhood.GOOGL },
  { market: '0x348dc1b94099CfbFf5A142f78a41542a42f4b2C7', underlying: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5' }, // CRCL
  { market: '0x39B338A02B33766C56C91049A5965ba7694754DF', underlying: ADDRESSES.robinhood.MSTR },
  { market: '0x4698Dd37664ade58c173FFd10C3A4DCE6d33241D', underlying: ADDRESSES.robinhood.AMD },
];
export const DEPLOYMENT_BLOCK = 101263991; // 2026-10-29, the first market
export const START = '2026-10-29';
export const USDG = ADDRESSES.robinhood.USDG;

export const ABI = {
  // one per fill, whichever path it took (a taker's fill of a signed order, or two orders matched)
  traded: 'event Traded(address indexed buyer, address indexed seller, uint256 indexed instrumentId, uint256 quantity)',
  // the premium leg of the same fill: the buyer pays sellerGets + fee, the fee is credited to the fee recipient
  premiumSettled: 'event PremiumSettled(address indexed buyer, address indexed seller, uint256 sellerGets, uint256 fee, bool buyerFromBalance, bool sellerFromBalance)',
};
