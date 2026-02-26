import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Old + new PerpPair (keep both for continuity across deployments)
const DENARIA_PERP_PAIR_OLD = '0xd07822ee341c11a193869034d7e5f583c4a94872';
const DENARIA_PERP_PAIR_NEW = '0x8db6865e37105ddd230caa20af787dd89c382b72';

const DENARIA_PERP_PAIRS: Array<string> = [
  DENARIA_PERP_PAIR_OLD,
  DENARIA_PERP_PAIR_NEW,
]

const DENARIA_PERP_PAIR_NEW_DEPLOY_BLOCK = 29101654;

const EXECUTED_TRADE_EVENT = "event ExecutedTrade(address indexed user, bool direction, uint256 tradeSize, uint256 tradeReturn, uint256 currentPrice, uint256 leverage)";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const tradeLogs: any[] = await options.getLogs({
    targets: DENARIA_PERP_PAIRS,
    eventAbi: EXECUTED_TRADE_EVENT,
    flatten: true,
  });

  for (const log of tradeLogs) {
    const isLong = Boolean(log.direction);

    const tradeSize = Number(log.tradeSize) / 1e18;
    const tradeReturn = Number(log.tradeReturn) / 1e18;
    const price = Number(log.currentPrice) / 1e8;

    if (isLong) {
      // LONG: volume = tradeSize(USD), fees = tradeSize - (tradeReturn(BTC)*price)
      dailyVolume.addUSDValue(tradeSize);
      dailyFees.addUSDValue(tradeSize - (tradeReturn * price));
    } else {
      // SHORT: volume = tradeSize(BTC)*price, fees = tradeSize(BTC)*price - tradeReturn(USD)
      dailyVolume.addUSDValue(tradeSize * price);
      dailyFees.addUSDValue(tradeSize * price - tradeReturn);
    }
  }

  // 2) Open Interest at end (read exposure at end-of-period block)
  const toBlock = await options.getToBlock();
  const oiTarget = toBlock >= DENARIA_PERP_PAIR_NEW_DEPLOY_BLOCK ? DENARIA_PERP_PAIR_NEW : DENARIA_PERP_PAIR_OLD;

  const totalTraderExposure = await options.api.call({
    target: oiTarget,
    abi: "uint256:totalTraderExposure",
    block: toBlock,
  });

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addCGToken("bitcoin", Number(totalTraderExposure) / 1e18);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    openInterestAtEnd,
  };
}

const methodology = {
  Volume: "All Denaria Perp volume on Linea, computed from ExecutedTrade notional in virtual USD across PerpPair deployments.",
  Fees: "Denaria Perp trading fees (fees + slippage) derived from ExecutedTrade, summed across PerpPair deployments.",
  Revenue: "All the fees are revenue.",
  ProtocolRevenue: "All the revenue goes to the protocol.",
  OpenInterestAtEnd: "Reads totalTraderExposure at end-of-period (toBlock) from the active PerpPair and reports it as BTC exposure.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-15",
  methodology,
};

export default adapter;