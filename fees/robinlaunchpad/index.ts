import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://robinlaunchpad.com/docs
const CURVE_LAUNCHPAD = "0x02DD76E9ed1b120254aF279b37B7eA655CB51C12";
const TOKEN_LAUNCHPAD = "0xBd23bE3dd20286Dd58ff9BE2dE7B698397d7BA0A";
const BUY =
  "event Buy(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee)";
const SELL =
  "event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee)";
const CREATOR_FEE_ACCRUED =
  "event CreatorFeeAccrued(address indexed token, address indexed creator, uint256 amount)";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const [curveBuys, curveSells, creatorFeeEvents, tokenBuys, tokenSells] = await Promise.all([
    options.getLogs({ target: CURVE_LAUNCHPAD, eventAbi: BUY }),
    options.getLogs({ target: CURVE_LAUNCHPAD, eventAbi: SELL }),
    options.getLogs({ target: CURVE_LAUNCHPAD, eventAbi: CREATOR_FEE_ACCRUED }),
    options.getLogs({ target: TOKEN_LAUNCHPAD, eventAbi: BUY }),
    options.getLogs({ target: TOKEN_LAUNCHPAD, eventAbi: SELL }),
  ]);

  let totalLaunchpadFeeRaw = 0n;
  let totalCreatorRaw = 0n;

  for (const log of curveBuys) {
    totalLaunchpadFeeRaw += BigInt(log.fee);
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
    dailyVolume.addGasToken(log.ethIn);
  }
  for (const log of curveSells) {
    totalLaunchpadFeeRaw += BigInt(log.fee);
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
    dailyVolume.addGasToken(log.ethOut);
  }
  for (const log of creatorFeeEvents) {
    totalCreatorRaw += BigInt(log.amount);
    dailySupplySideRevenue.addGasToken(log.amount, "Creator Trading Fees");
  }
  for (const log of tokenBuys) {
    totalLaunchpadFeeRaw += BigInt(log.fee);
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
    dailyVolume.addGasToken(log.ethIn);
  }
  for (const log of tokenSells) {
    totalLaunchpadFeeRaw += BigInt(log.fee);
    dailyFees.addGasToken(log.fee, METRIC.TRADING_FEES);
    dailyVolume.addGasToken(log.ethOut);
  }

  dailyRevenue.addGasToken(totalLaunchpadFeeRaw - totalCreatorRaw, "Protocol Trading Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Total USDT0 volume from all buys and sells on the launchpad.",
  Fees:
    "Trade fees on every buy and sell, read directly from the Buy/Sell `fee` field emitted by the contract.",
  Revenue:
    "Protocol share of trade fees: total fees minus creator cuts emitted via CreatorFeeAccrued.",
  ProtocolRevenue:
    "Protocol share of trade fees: total fees minus creator cuts emitted via CreatorFeeAccrued.",
  SupplySideRevenue:
    "Creator share of trade fees, read directly from CreatorFeeAccrued events, claimable by each token's creator.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "Trade fees on every buy and sell, read directly from the Buy/Sell `fee` field.",
  },
  Revenue: {
    "Protocol Trading Fees":
      "Total trade fees minus creator cuts emitted via CreatorFeeAccrued.",
  },
  ProtocolRevenue: {
    "Protocol Trading Fees":
      "Total trade fees minus creator cuts emitted via CreatorFeeAccrued.",
  },
  SupplySideRevenue: {
    "Creator Trading Fees":
      "Creator share of each trade fee emitted via CreatorFeeAccrued, claimable by the token creator.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.STABLE],
  fetch,
  start: "2026-07-23",
};

export default adapter;
