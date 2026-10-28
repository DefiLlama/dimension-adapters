import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// PaperStrategy (https://docs.paperstrategy.xyz) is a taxed token on HyperEVM built on Papertrade. Every PSTR buy and sell
// pays a 10% tax, taken in PSTR and sold for HYPE: one tenth to the team, nine tenths to the treasury, which funds Papertrade
// accounts that acquire and stake PAPER. The staking yield (USDC) is swapped to WHYPE and sent to the buyback contract,
// which pays the team 10% and spends the rest buying PSTR and burning it.
// The yield is counted when the buyback spends it: the dividend converter (0x5193db1b72f227b6a1e8899d4d183e2aa202e483, the docs
// still list the earlier 0x582d93fc260d2a61421b92d3adc124812820acc9) holds the claimed USDC and swaps it in small hourly batches.
const PSTR = "0xb9cd945141f7d99fd562a6222accde5043350ad4";
const BUYBACK = "0xecc3ffee7f31ac5bfae85ff27fe5ce1df2de2463";

const EVENTS = {
  FeesTaken: "event FeesTaken(address indexed from, address indexed to, uint256 amount)",
  FeesConverted: "event FeesConverted(uint256 pstrAmount, uint256 hypeAmount)",
  TeamFeePaid: "event TeamFeePaid(uint256 pstrAmount, uint256 hypeAmount)",
  TeamPaid: "event TeamPaid(uint256 hypeAmount)",
  Executed: "event Executed(uint256 hypeAmount, uint256 pstrBurned)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [taxes, treasuryConversions, teamConversions, teamYield, buybacks] = await Promise.all([
    options.getLogs({ target: PSTR, eventAbi: EVENTS.FeesTaken }),
    options.getLogs({ target: PSTR, eventAbi: EVENTS.FeesConverted }),
    options.getLogs({ target: PSTR, eventAbi: EVENTS.TeamFeePaid }),
    options.getLogs({ target: BUYBACK, eventAbi: EVENTS.TeamPaid }),
    options.getLogs({ target: BUYBACK, eventAbi: EVENTS.Executed }),
  ]);

  // The buyback's own PSTR purchases are taxed too. That tax is paid out of the staking yield, so it is kept out of the trade
  // tax and moved from holders revenue to protocol revenue instead of being counted twice.
  let traderTaxPstr = 0n;
  let buybackTaxPstr = 0n;
  taxes.forEach((log: any) => {
    if (log.from.toLowerCase() === BUYBACK || log.to.toLowerCase() === BUYBACK) buybackTaxPstr += BigInt(log.amount);
    else traderTaxPstr += BigInt(log.amount);
  });

  // Tax is booked when it is taken, valued at the rate the contract sold tax PSTR for HYPE in the same window. The PSTR is
  // sold in batches, so a window without a sale falls back to the PSTR market price.
  let convertedPstr = 0n;
  let convertedHype = 0n;
  [...treasuryConversions, ...teamConversions].forEach((log: any) => {
    convertedPstr += BigInt(log.pstrAmount);
    convertedHype += BigInt(log.hypeAmount);
  });
  const traderTaxToken = convertedPstr > 0n ? ADDRESSES.hyperliquid.WHYPE : PSTR;
  const traderTax = (convertedPstr > 0n ? traderTaxPstr * convertedHype / convertedPstr : traderTaxPstr).toString();

  let teamYieldHype = 0n;
  teamYield.forEach((log: any) => { teamYieldHype += BigInt(log.hypeAmount); });
  // The buyback's tax is valued at its own purchase rate: the HYPE it spent over the PSTR it bought (burned plus taxed).
  let buybackHype = 0n;
  let burnedPstr = 0n;
  buybacks.forEach((log: any) => {
    buybackHype += BigInt(log.hypeAmount);
    burnedPstr += BigInt(log.pstrBurned);
  });
  const buybackTaxHype = buybackTaxPstr > 0n ? buybackHype * buybackTaxPstr / (burnedPstr + buybackTaxPstr) : 0n;

  dailyFees.add(traderTaxToken, traderTax, "PSTR Trade Tax");
  dailyFees.add(ADDRESSES.hyperliquid.WHYPE, (teamYieldHype + buybackHype).toString(), "Staked PAPER Yield");

  dailyUserFees.add(traderTaxToken, traderTax, "PSTR Trade Tax");

  dailyProtocolRevenue.add(traderTaxToken, traderTax, "PSTR Trade Tax");
  dailyProtocolRevenue.add(ADDRESSES.hyperliquid.WHYPE, teamYieldHype.toString(), "Staked PAPER Yield To Team");
  dailyProtocolRevenue.add(ADDRESSES.hyperliquid.WHYPE, buybackTaxHype.toString(), "Staked PAPER Yield Via Buyback Tax");

  dailyHoldersRevenue.add(ADDRESSES.hyperliquid.WHYPE, (buybackHype - buybackTaxHype).toString(), "PSTR Buyback And Burn");

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-07",
  methodology: {
    Fees: "The 10% tax traders pay on PSTR buys and sells, plus the USDC yield earned by the PAPER the treasury has staked on Papertrade, valued at the HYPE it is swapped to and counted when the buyback contract spends it. Tax paid by the buyback contract's own purchases is excluded, since it is paid out of that yield.",
    UserFees: "The 10% tax traders pay on PSTR buys and sells.",
    Revenue: "All fees: the trade tax goes to the team and the treasury and the yield goes to the team and the buyback.",
    ProtocolRevenue: "The trade tax (one tenth to the team, nine tenths to the treasury that acquires and stakes PAPER), the team's 10% share of the staking yield, and the tax the buyback contract pays on its own PSTR purchases.",
    HoldersRevenue: "The staking yield the buyback contract spends buying PSTR and burning it, net of the 10% tax it pays on those purchases.",
  },
  breakdownMethodology: {
    Fees: {
      "PSTR Trade Tax": "10% tax on PSTR buys and sells paid by traders, valued at the HYPE the contract sells tax PSTR for, or at the PSTR market price when none is sold in the period.",
      "Staked PAPER Yield": "USDC staking yield earned by the treasury's PAPER on Papertrade, swapped to WHYPE and sent to the buyback contract.",
    },
    UserFees: {
      "PSTR Trade Tax": "10% tax on PSTR buys and sells paid by traders, valued at the HYPE the contract sells tax PSTR for, or at the PSTR market price when none is sold in the period.",
    },
    Revenue: {
      "PSTR Trade Tax": "10% tax on PSTR buys and sells paid by traders, valued at the HYPE the contract sells tax PSTR for, or at the PSTR market price when none is sold in the period.",
      "Staked PAPER Yield": "USDC staking yield earned by the treasury's PAPER on Papertrade, swapped to WHYPE and sent to the buyback contract.",
    },
    ProtocolRevenue: {
      "PSTR Trade Tax": "Trade tax split one tenth to the team and nine tenths to the treasury.",
      "Staked PAPER Yield To Team": "The team's 10% share of the staking yield, paid by the buyback contract.",
      "Staked PAPER Yield Via Buyback Tax": "The 10% tax the buyback contract pays on its own PSTR purchases, which goes to the team and the treasury like any other trade tax.",
    },
    HoldersRevenue: {
      "PSTR Buyback And Burn": "WHYPE the buyback contract spends buying PSTR that it burns, net of the tax on those purchases.",
    },
  },
};

export default adapter;
