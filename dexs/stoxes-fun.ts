import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Stoxes.fun: bonding-curve launchpad on BNB Chain for tokens quoted in BNB and Binance tokenized stocks (bStocks such as
// BNCB, NVDAB, SPCXB, ANTB). Buys and sells happen on a Portal until the curve fills, then the token graduates to PancakeSwap.
// Only pre-graduation curve trades are counted here; post-graduation PancakeSwap volume belongs to PancakeSwap.
// Contract list: deployment registry in the https://stoxes.fun frontend bundle (fromBlock per deployment).
// Current Portal source (verified, exact match): https://sourcify.dev/server/v2/contract/56/0x5515ec89047e91ed6f639f23fddf784293cdfcb5
// The legacy Portal is not verified but emits the same Bought / Sold / TaxRouted events (checked on sample txs
// 0xe8dd65f75916817e4b5e9b8ff3f2f8c25df28d91e985babb61a0caa78b0e6d4c and 0x5a03b67d9c495df96c66627cf154ad5b6153640d7c38f815049b0c00f0a281e4).
const PORTALS = [
  "0xbe446b5baaaa003121b1196b01a1476a1ccaacc0", // legacy Portal, token factory 0xdfb1afc6dabcbc23e5a3fd09c8a0137112f58f96, from block 128742199 (2026-10-20)
  "0x5515ec89047e91ed6f639f23fddf784293cdfcb5", // current Portal, token factory 0x9b8b27cbfde73289f1e65065df4712e91241588f, from block 133111846 (2026-11-12)
];

// StoxesBnbPortal.sol: every buy/sell pays CURVE_FEE_BPS = 100 (1%) to `treasury` (0x9070925F1850d7D71Ab43bDCA4AD4B89B820CF42).
// Tax-kind tokens add a creator-set buy/sell tax. TaxRouted splits it: protocolAmount = min(tax, 0.3% of the trade, PROTOCOL_BPS_OF_TAXED_VOLUME = 30)
// to the treasury; commission is charged on the post-protocol tax remainder, then vault (token's reserve vault), creator, burn and liquidity buckets.
const eventAbis = {
  bought: "event Bought(address indexed token, address indexed buyer, address indexed caller, uint256 quoteSpent, uint256 fee, uint256 tax, uint256 tokensOut, uint256 refund)",
  sold: "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 grossQuote, uint256 fee, uint256 tax, uint256 quoteOut)",
  taxRouted: "event TaxRouted(address indexed token, uint256 protocolAmount, uint256 commissionAmount, uint256 vaultAmount, uint256 creatorAmount, uint256 burnAmount, uint256 liquidityAmount)",
};
// tokenState returns (kind, quoteToken, graduated, finalized, sold, quoteReserve). BNB-quoted tokens report WBNB as quote.
const tokenStateAbi = "function tokenState(address token) view returns (uint8 kind, address quoteToken, bool graduated, bool finalized, uint256 sold, uint256 quoteReserve)";

const LABELS = {
  curveFee: "Curve Trading Fees",
  taxProtocol: "Token Tax To Protocol",
  taxCommission: "Token Tax To Referrers",
  taxVault: "Token Tax To Token Vaults",
  taxCreator: "Token Tax To Creators",
  taxBurn: "Token Tax To Buyback Burn",
  taxLiquidity: "Token Tax To Liquidity",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // One pass per Portal so every log keeps the Portal it came from (quote lookup is per Portal).
  // skipCacheRead: with hourly slots the local log cache dropped a Sold log in testing (same as dexs/flap.ts).
  const quoteOf: Record<string, string> = {};
  const keyOf = (portal: string, token: string) => `${portal}-${String(token).toLowerCase()}`;
  const perPortal = [];
  for (const portal of PORTALS) {
    const [buys, sells, taxes] = await Promise.all([
      options.getLogs({ target: portal, eventAbi: eventAbis.bought, skipCacheRead: true }),
      options.getLogs({ target: portal, eventAbi: eventAbis.sold, skipCacheRead: true }),
      options.getLogs({ target: portal, eventAbi: eventAbis.taxRouted, skipCacheRead: true }),
    ]);
    perPortal.push({ portal, buys, sells, taxes });
  }

  // Quote token is fixed at registration, so reading it at the latest block is safe.
  const calls: { target: string; params: string[] }[] = [];
  const seen = new Set<string>();
  perPortal.forEach(({ portal, buys, sells, taxes }) => {
    [...buys, ...sells, ...taxes].forEach((l: any) => {
      const key = keyOf(portal, l.token);
      if (seen.has(key)) return;
      seen.add(key);
      calls.push({ target: portal, params: [String(l.token).toLowerCase()] });
    });
  });
  if (calls.length) {
    const latestApi = new ChainApi({ chain: options.chain });
    const states = await latestApi.multiCall({ abi: tokenStateAbi, calls });
    calls.forEach((c, i) => { quoteOf[keyOf(c.target, c.params[0])] = states[i].quoteToken; });
  }

  perPortal.forEach(({ portal, buys, sells, taxes }) => {
    buys.forEach((l: any) => {
      const quote = quoteOf[keyOf(portal, l.token)];
      dailyVolume.add(quote, l.quoteSpent); // gross quote paid, incl. fee and tax
      dailyFees.add(quote, l.fee, LABELS.curveFee);
      dailyRevenue.add(quote, l.fee, LABELS.curveFee);
    });
    sells.forEach((l: any) => {
      const quote = quoteOf[keyOf(portal, l.token)];
      dailyVolume.add(quote, l.grossQuote); // gross quote out of the curve, before fee and tax
      dailyFees.add(quote, l.fee, LABELS.curveFee);
      dailyRevenue.add(quote, l.fee, LABELS.curveFee);
    });
    taxes.forEach((l: any) => {
      const quote = quoteOf[keyOf(portal, l.token)];
      dailyFees.add(quote, l.protocolAmount, LABELS.taxProtocol);
      dailyRevenue.add(quote, l.protocolAmount, LABELS.taxProtocol);
      const supply: [string, bigint][] = [
        [LABELS.taxCommission, l.commissionAmount],
        [LABELS.taxVault, l.vaultAmount],
        [LABELS.taxCreator, l.creatorAmount],
        [LABELS.taxBurn, l.burnAmount],
        [LABELS.taxLiquidity, l.liquidityAmount],
      ];
      supply.forEach(([label, amount]) => {
        dailyFees.add(quote, amount, label);
        dailySupplySideRevenue.add(quote, amount, label);
      });
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Bonding-curve trades on the Stoxes.fun Portals: quoteSpent of Bought events plus grossQuote of Sold events, in the token's quote asset (BNB or a bStock). Post-graduation PancakeSwap trades are not counted.",
  Fees: "1% curve fee on every buy and sell, plus the creator-set token tax on tax-kind tokens.",
  UserFees: "Same as Fees, paid by traders.",
  Revenue: "1% curve fee sent to the Stoxes treasury, plus the protocol share of token tax (up to 0.3% of trade size).",
  ProtocolRevenue: "Same as Revenue, all kept by the Stoxes treasury.",
  SupplySideRevenue: "Token tax routed to referrers, token reserve vaults, creators, buyback-burn and liquidity buckets.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.curveFee]: "1% fee (CURVE_FEE_BPS = 100) on every Portal buy and sell, from the fee field of Bought / Sold.",
    [LABELS.taxProtocol]: "Protocol share of token tax, min(tax, 0.3% of trade), from TaxRouted.protocolAmount.",
    [LABELS.taxCommission]: "Token tax paid to the token's commission receiver, from TaxRouted.commissionAmount.",
    [LABELS.taxVault]: "Token tax sent to the token's reserve vault, from TaxRouted.vaultAmount.",
    [LABELS.taxCreator]: "Token tax accrued to the token creator, from TaxRouted.creatorAmount.",
    [LABELS.taxBurn]: "Token tax escrowed for buyback and burn, from TaxRouted.burnAmount.",
    [LABELS.taxLiquidity]: "Token tax escrowed for liquidity, from TaxRouted.liquidityAmount.",
  },
  UserFees: {
    [LABELS.curveFee]: "1% fee on every Portal buy and sell.",
    [LABELS.taxProtocol]: "Protocol share of token tax.",
    [LABELS.taxCommission]: "Token tax to commission receivers.",
    [LABELS.taxVault]: "Token tax to token reserve vaults.",
    [LABELS.taxCreator]: "Token tax to creators.",
    [LABELS.taxBurn]: "Token tax to buyback and burn.",
    [LABELS.taxLiquidity]: "Token tax to liquidity.",
  },
  Revenue: {
    [LABELS.curveFee]: "1% curve fee paid to the Stoxes treasury.",
    [LABELS.taxProtocol]: "Protocol share of token tax paid to the Stoxes treasury.",
  },
  ProtocolRevenue: {
    [LABELS.curveFee]: "1% curve fee paid to the Stoxes treasury.",
    [LABELS.taxProtocol]: "Protocol share of token tax paid to the Stoxes treasury.",
  },
  SupplySideRevenue: {
    [LABELS.taxCommission]: "Token tax to commission receivers.",
    [LABELS.taxVault]: "Token tax to token reserve vaults.",
    [LABELS.taxCreator]: "Token tax to creators.",
    [LABELS.taxBurn]: "Token tax escrowed for buyback and burn of the launched token.",
    [LABELS.taxLiquidity]: "Token tax escrowed for liquidity of the launched token.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-10-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
