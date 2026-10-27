import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ROBINHOOD_WETH } from "../stonkbrokers/helpers";

/**
 * StonkBrokers x Mutual Fun (TMF) OpenMarket on Robinhood Chain.
 *
 * The OpenMarket escrow charges a deposit tax in TMF. Anyone can call
 * sweepTax(), which pays out the accrued take and emits
 * TheTakeSwept(toStonk, toFunds, toDesk). The house rules split the take
 * 20% StonkBrokers / 60% dividend office (open books) / 20% marketing desk.
 * When no book is open the 60% leg goes to the estate and toFunds is emitted
 * as 0, so the full take is always toStonk / 20%.
 *
 * TMF has no external price, so amounts are converted to WETH at the spot
 * price of the canonical Uniswap v3 TMF/WETH 1% pool at the end of the period.
 */

const OPEN_MARKET = "0x0959f956a13f73be944D564E301DF63e3Ba02047";
const TMF = "0xC76B6020a3D7f4bb5cEE85d44F8b0Da6a6Ee7616";
const TMF_WETH_POOL = "0xE71058168390371d86a9d98d73acAd4758a8c06E";
const TAKE_SWEPT = "event TheTakeSwept(uint256 toStonk, uint256 toFunds, uint256 toDesk)";

const STONK_BPS = 2000n;
const BPS = 10000n;
const Q192 = 1n << 192n;

const LABELS = {
  TAKE: "OpenMarket Deposit Tax",
  STONK: "OpenMarket Tax To StonkBrokers",
  HOLDERS: "OpenMarket Tax To Dividend Office And Desk",
};

async function tmfToWeth(options: FetchOptions, amount: bigint): Promise<bigint> {
  if (amount === 0n) return 0n;
  const [slot0, token0] = await Promise.all([
    options.toApi.call({
      target: TMF_WETH_POOL,
      abi: "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    }),
    options.toApi.call({ target: TMF_WETH_POOL, abi: "function token0() view returns (address)" }),
  ]);
  const sqrtP = BigInt(slot0.sqrtPriceX96 ?? slot0[0]);
  const priceX192 = sqrtP * sqrtP; // token1 per token0, scaled by 2^192
  if (priceX192 === 0n) return 0n;
  // Both tokens carry 18 decimals.
  if (String(token0).toLowerCase() === TMF.toLowerCase()) return (amount * priceX192) / Q192;
  return (amount * Q192) / priceX192;
}

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

  const takeWeth = await tmfToWeth(options, take);
  const stonkWeth = await tmfToWeth(options, toStonk);

  dailyFees.add(ROBINHOOD_WETH, takeWeth, LABELS.TAKE);
  dailyRevenue.add(ROBINHOOD_WETH, stonkWeth, LABELS.STONK);
  dailyProtocolRevenue.add(ROBINHOOD_WETH, stonkWeth, LABELS.STONK);
  dailySupplySideRevenue.add(ROBINHOOD_WETH, takeWeth - stonkWeth, LABELS.HOLDERS);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-10-26" },
  },
  methodology: {
    Fees: "The TMF deposit tax collected by the Mutual Fun OpenMarket escrow, counted when swept (TheTakeSwept) and valued at the TMF/WETH Uniswap v3 spot price.",
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
