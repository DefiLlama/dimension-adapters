import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPEN_MARKET = "0x0959f956a13f73be944D564E301DF63e3Ba02047";
const TMF = "0xC76B6020a3D7f4bb5cEE85d44F8b0Da6a6Ee7616";
const TAKE_SWEPT = "event TheTakeSwept(uint256 toStonk, uint256 toFunds, uint256 toDesk)";

const STONK_BPS = 2000n;
const BPS = 10000n;

const LABELS = {
  TAKE: "OpenMarket Deposit Tax",
  STONK: "OpenMarket Tax To StonkBrokers",
  HOLDERS: "OpenMarket Tax To Dividend Office And Desk",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: OPEN_MARKET, eventAbi: TAKE_SWEPT });

  let take = 0n;
  let toStonk = 0n;
  for (const log of logs) {
    const stonk = BigInt(log.toStonk);
    toStonk += stonk;
    take += (stonk * BPS) / STONK_BPS;
  }

  dailyFees.add(TMF, take, LABELS.TAKE);
  dailyRevenue.add(TMF, toStonk, LABELS.STONK);
  dailyProtocolRevenue.add(TMF, toStonk, LABELS.STONK);
  dailySupplySideRevenue.add(TMF, take - toStonk, LABELS.HOLDERS);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-26",
  methodology: {
    Fees: "The TMF deposit tax collected by the Mutual Fun OpenMarket escrow, counted when swept (TheTakeSwept).",
    Revenue: "The 20% StonkBrokers share of the swept tax.",
    ProtocolRevenue: "The 20% StonkBrokers share of the swept tax.",
    SupplySideRevenue: "The 60% dividend office (or estate when no book is open) and 20% marketing desk shares of the swept tax.",
  },
  breakdownMethodology: {
    Fees: { [LABELS.TAKE]: "Full OpenMarket deposit tax swept by sweepTax()." },
    Revenue: { [LABELS.STONK]: "20% of the swept tax paid to the StonkBrokers wallet." },
    ProtocolRevenue: { [LABELS.STONK]: "20% of the swept tax paid to the StonkBrokers wallet." },
    SupplySideRevenue: { [LABELS.HOLDERS]: "60% dividend office or estate plus 20% marketing desk." },
  },
};

export default adapter;
