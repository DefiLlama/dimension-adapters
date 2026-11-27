import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Bonding-curve Portals from the stoxes.fun frontend deployment registry
const PORTALS = [
  "0xbe446b5baaaa003121b1196b01a1476a1ccaacc0", // legacy, from 2026-10-20
  "0x5515ec89047e91ed6f639f23fddf784293cdfcb5", // current, from 2026-11-12
];

// 1% curve fee and protocol tax share min(tax, 0.3% of trade) go to the treasury: https://sourcify.dev/server/v2/contract/56/0x5515ec89047e91ed6f639f23fddf784293cdfcb5
const eventAbis = {
  bought: "event Bought(address indexed token, address indexed buyer, address indexed caller, uint256 quoteSpent, uint256 fee, uint256 tax, uint256 tokensOut, uint256 refund)",
  sold: "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 grossQuote, uint256 fee, uint256 tax, uint256 quoteOut)",
  taxRouted: "event TaxRouted(address indexed token, uint256 protocolAmount, uint256 commissionAmount, uint256 vaultAmount, uint256 creatorAmount, uint256 burnAmount, uint256 liquidityAmount)",
};
const tokenStateAbi = "function tokenState(address token) view returns (uint8 kind, address quoteToken, bool graduated, bool finalized, uint256 sold, uint256 quoteReserve)";

const LABELS = {
  curveFee: "Curve Trading Fees",
  tokenTax: "Token Tax",
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

  const [buys, sells, taxes] = await Promise.all([
    options.getLogs({ targets: PORTALS, eventAbi: eventAbis.bought, flatten: false }),
    options.getLogs({ targets: PORTALS, eventAbi: eventAbis.sold, flatten: false }),
    options.getLogs({ targets: PORTALS, eventAbi: eventAbis.taxRouted, flatten: false }),
  ]);

  const calls = PORTALS.flatMap((portal, i) => {
    const tokens = new Set([...buys[i], ...sells[i], ...taxes[i]].map((l: any) => l.token.toLowerCase()));
    return [...tokens].map((token) => ({ target: portal, params: [token] }));
  });
  const states = await options.api.multiCall({ abi: tokenStateAbi, calls });
  const quoteOf: Record<string, string> = {};
  calls.forEach((c, i) => { quoteOf[`${c.target}-${c.params[0]}`] = states[i].quoteToken; });

  PORTALS.forEach((portal, i) => {
    const quote = (l: any) => quoteOf[`${portal}-${l.token.toLowerCase()}`];

    const addTrade = (l: any, quoteAmount: bigint) => {
      dailyVolume.add(quote(l), quoteAmount);
      dailyFees.add(quote(l), l.fee, LABELS.curveFee);
      dailyRevenue.add(quote(l), l.fee, LABELS.curveFee);
    };
    buys[i].forEach((l: any) => addTrade(l, l.quoteSpent));
    sells[i].forEach((l: any) => addTrade(l, l.grossQuote));

    taxes[i].forEach((l: any) => {
      dailyFees.add(quote(l), l.protocolAmount, LABELS.tokenTax);
      dailyRevenue.add(quote(l), l.protocolAmount, LABELS.taxProtocol);
      const supplySide: [string, bigint][] = [
        [LABELS.taxCommission, l.commissionAmount],
        [LABELS.taxVault, l.vaultAmount],
        [LABELS.taxCreator, l.creatorAmount],
        [LABELS.taxBurn, l.burnAmount],
        [LABELS.taxLiquidity, l.liquidityAmount],
      ];
      supplySide.forEach(([label, amount]) => {
        dailyFees.add(quote(l), amount, LABELS.tokenTax);
        dailySupplySideRevenue.add(quote(l), amount, label);
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
  Volume: "Buys and sells on the Stoxes.fun bonding curves, in each token's quote asset (BNB or a Binance tokenized stock). Trades after a token graduates to PancakeSwap are excluded.",
  Fees: "1% curve fee on every bonding-curve buy and sell, plus the creator-set buy/sell tax on tax tokens.",
  UserFees: "1% curve fee and the creator-set buy/sell tax, paid by traders on every bonding-curve buy and sell.",
  Revenue: "1% curve fee plus the protocol share of token tax (up to 0.3% of trade size), both sent to the Stoxes treasury.",
  ProtocolRevenue: "1% curve fee plus the protocol share of token tax (up to 0.3% of trade size), kept by the Stoxes treasury.",
  SupplySideRevenue: "Token tax left after the protocol share, paid to referrers, token reserve vaults, creators, and the buyback-burn and liquidity reserves of the launched token.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.curveFee]: "1% fee (CURVE_FEE_BPS = 100) on every Portal buy and sell, from the fee field of Bought / Sold.",
    [LABELS.tokenTax]: "Creator-set buy/sell tax on tax tokens, split between the protocol (up to 0.3% of trade), referrers, token vaults, creators, buyback-burn and liquidity.",
  },
  UserFees: {
    [LABELS.curveFee]: "1% fee on every Portal buy and sell.",
    [LABELS.tokenTax]: "Creator-set buy/sell tax paid by traders of tax tokens.",
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
  fetch ,
  chains: [CHAIN.BSC],
  start: "2026-10-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
