import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// PaperStrategy (https://docs.paperstrategy.xyz) is a taxed token on HyperEVM built on Papertrade. Every PSTR buy and sell
// pays a 10% tax, taken in PSTR and sold for HYPE: one tenth to the team, nine tenths to the treasury, which funds Papertrade
// accounts that acquire and stake PAPER. The staking yield (USDC) is swapped to WHYPE and sent to the buyback contract,
// which pays the team 10% and spends the rest buying PSTR and burning it.
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
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [taxes, treasuryConversions, teamConversions, teamYield, buybacks] = await Promise.all([
    options.getLogs({ target: PSTR, eventAbi: EVENTS.FeesTaken }),
    options.getLogs({ target: PSTR, eventAbi: EVENTS.FeesConverted }),
    options.getLogs({ target: PSTR, eventAbi: EVENTS.TeamFeePaid }),
    options.getLogs({ target: BUYBACK, eventAbi: EVENTS.TeamPaid }),
    options.getLogs({ target: BUYBACK, eventAbi: EVENTS.Executed }),
  ]);

  // The buyback's own PSTR purchases are taxed too. That slice is already counted as staking yield, so only the share of the
  // tax paid by other traders is booked as trade tax. The tax is valued at the HYPE it was actually sold for.
  let taxedPstr = 0n;
  let taxedPstrFromBuyback = 0n;
  taxes.forEach((log: any) => {
    const amount = BigInt(log.amount);
    taxedPstr += amount;
    if (log.from.toLowerCase() === BUYBACK || log.to.toLowerCase() === BUYBACK) taxedPstrFromBuyback += amount;
  });
  const traderShare = taxedPstr > 0n ? Number(taxedPstr - taxedPstrFromBuyback) / Number(taxedPstr) : 1;

  let treasuryTaxHype = 0;
  treasuryConversions.forEach((log: any) => { treasuryTaxHype += Number(log.hypeAmount); });
  let teamTaxHype = 0;
  teamConversions.forEach((log: any) => { teamTaxHype += Number(log.hypeAmount); });
  const taxHype = (treasuryTaxHype + teamTaxHype) * traderShare;

  let teamYieldHype = 0;
  teamYield.forEach((log: any) => { teamYieldHype += Number(log.hypeAmount); });
  let buybackHype = 0;
  buybacks.forEach((log: any) => { buybackHype += Number(log.hypeAmount); });

  dailyFees.add(ADDRESSES.hyperliquid.WHYPE, taxHype, "PSTR Trade Tax");
  dailyFees.add(ADDRESSES.hyperliquid.WHYPE, teamYieldHype + buybackHype, "Staked PAPER Yield");

  dailyProtocolRevenue.add(ADDRESSES.hyperliquid.WHYPE, taxHype, "PSTR Trade Tax");
  dailyProtocolRevenue.add(ADDRESSES.hyperliquid.WHYPE, teamYieldHype, "Staked PAPER Yield To Team");

  dailyHoldersRevenue.add(ADDRESSES.hyperliquid.WHYPE, buybackHype, "PSTR Buyback And Burn");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
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
    Fees: "The 10% tax on PSTR buys and sells, valued at the HYPE it is sold for, plus the USDC yield earned by the PAPER the treasury has staked on Papertrade, valued at the HYPE it is swapped to. Tax paid by the buyback contract's own purchases is excluded, since it is already part of the yield.",
    UserFees: "The 10% tax paid by PSTR traders, plus the staking yield.",
    Revenue: "All fees: the tax goes to the team and the treasury and the yield goes to the team and the buyback.",
    ProtocolRevenue: "The trade tax (one tenth to the team, nine tenths to the treasury that acquires and stakes PAPER) plus the team's 10% share of the staking yield.",
    HoldersRevenue: "The 90% of the staking yield that the buyback contract spends buying PSTR and burning it.",
  },
  breakdownMethodology: {
    Fees: {
      "PSTR Trade Tax": "10% tax on PSTR buys and sells paid by traders, valued at the HYPE the contract sells it for.",
      "Staked PAPER Yield": "USDC staking yield earned by the treasury's PAPER on Papertrade, swapped to WHYPE and sent to the buyback contract.",
    },
    Revenue: {
      "PSTR Trade Tax": "10% tax on PSTR buys and sells paid by traders, valued at the HYPE the contract sells it for.",
      "Staked PAPER Yield": "USDC staking yield earned by the treasury's PAPER on Papertrade, swapped to WHYPE and sent to the buyback contract.",
    },
    ProtocolRevenue: {
      "PSTR Trade Tax": "Trade tax split one tenth to the team and nine tenths to the treasury.",
      "Staked PAPER Yield To Team": "The team's 10% share of the staking yield, paid by the buyback contract.",
    },
    HoldersRevenue: {
      "PSTR Buyback And Burn": "WHYPE the buyback contract spends buying PSTR, which it burns.",
    },
  },
};

export default adapter;
