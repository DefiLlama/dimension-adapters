import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Bordrless's indexer of its own programs (source: https://github.com/BordrlessDex/bordrless-sdk). Amounts
// are raw base units by mint; bridged SOL is told as SOL. The protocol fee goes to the Bordrless
// treasury, which spends half of it buying back $BORDR (https://bordrless.app/docs/tokenomics).
const BUYBACK_SHARE = 0.5;

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`https://bordrless.app/api/stats/defillama?start=${options.startTimestamp}&end=${options.endTimestamp}`);
  const side = data.launchpad;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const [mint, raw] of Object.entries(side.protocolFees as Record<string, string>)) {
    const amount = Number(raw);
    dailyFees.add(mint, amount, "Trading Fees");
    dailyRevenue.add(mint, amount, "Trading Fees To Protocol");
    dailyHoldersRevenue.add(mint, amount * BUYBACK_SHARE, "BORDR Buy Back");
    dailyProtocolRevenue.add(mint, amount * (1 - BUYBACK_SHARE), "Trading Fees To Treasury");
  }
  const supplySide: [string, string, string][] = [
    ["lpFees", "LP Fees", "LP Fees To Liquidity Providers"],
    ["creatorFees", "Creator Fees", "Creator Fees To Coin Creators"],
    ["holderFees", "Holder Reward Fees", "Holder Reward Fees To Coin Holders"],
  ];
  for (const [key, source, destination] of supplySide) {
    for (const [mint, raw] of Object.entries(side[key] as Record<string, string>)) {
      dailyFees.add(mint, Number(raw), source);
      dailySupplySideRevenue.add(mint, Number(raw), destination);
    }
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Every fee traders pay on trades on the Bordrless launchpad bonding curve, before a coin graduates: the protocol fee, LP fee, coin creator fee and holder reward fee.",
  UserFees: "Same as Fees, all paid by traders.",
  Revenue: "The protocol fee, paid to the Bordrless treasury.",
  ProtocolRevenue: "Half of the protocol fee, kept by the treasury.",
  HoldersRevenue: "Half of the protocol fee, spent buying back $BORDR.",
  SupplySideRevenue: "Fees paid to liquidity providers, coin creators and coin holders.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "The Bordrless protocol fee on each trade.",
    "LP Fees": "The fee kept by the pool for its liquidity providers.",
    "Creator Fees": "The fee a coin's creator set, paid to their wallet or their coin's companion pot.",
    "Holder Reward Fees": "The fee a coin sets aside for its holders.",
  },
  Revenue: { "Trading Fees To Protocol": "The protocol fee, paid to the Bordrless treasury." },
  ProtocolRevenue: { "Trading Fees To Treasury": "Half of the protocol fee, kept by the treasury." },
  HoldersRevenue: { "BORDR Buy Back": "Half of the protocol fee, spent buying back $BORDR." },
  SupplySideRevenue: {
    "LP Fees To Liquidity Providers": "The LP fee, kept by the pool.",
    "Creator Fees To Coin Creators": "The creator fee, paid to the coin's creator.",
    "Holder Reward Fees To Coin Holders": "The holder reward fee, paid to the coin's holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2026-10-08" } },
  methodology,
  breakdownMethodology,
};

export default adapter;
