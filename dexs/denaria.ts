import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Old + new PerpPair (keep both for continuity across deployments)
const DENARIA_PERP_PAIR_OLD = ['0xd07822ee341c11a193869034d7e5f583c4a94872', '0x8db6865e37105ddd230caa20af787dd89c382b72', '0xc4def9ef12b822bd71addd6ace624984afe598c7'];
const DENARIA_PERP_PAIR_NEW = '0xb68396dd4230253d27589e2004ac37389836ae17';

const DENARIA_PERP_PAIRS: Array<string> = [
  ...DENARIA_PERP_PAIR_OLD,
  DENARIA_PERP_PAIR_NEW,
]

const TRADING_FEES = 'Trading Fees';

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
      dailyFees.addUSDValue(tradeSize - (tradeReturn * price), TRADING_FEES);
    } else {
      // SHORT: volume = tradeSize(BTC)*price, fees = tradeSize(BTC)*price - tradeReturn(USD)
      dailyVolume.addUSDValue(tradeSize * price);
      dailyFees.addUSDValue(tradeSize * price - tradeReturn, TRADING_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Volume: "All volume of Denaria's own vAMM perp engine on Linea, computed from ExecutedTrade notional in virtual USD across PerpPair deployments. Sunset on 2026-09-03: Denaria trading moved to GMX V2 on Arbitrum, tracked by the separate denaria-gmx adapter.",
  Fees: "Denaria Perp trading fees (fees + slippage) derived from ExecutedTrade, summed across PerpPair deployments.",
  Revenue: "All the fees are revenue.",
  ProtocolRevenue: "All the revenue goes to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [TRADING_FEES]: "Trading fees and slippage paid on each ExecutedTrade: the trade input value minus the value returned, priced at the trade's oracle price.",
  },
  Revenue: {
    [TRADING_FEES]: "All trading fees are kept by Denaria.",
  },
  ProtocolRevenue: {
    [TRADING_FEES]: "All trading fees go to the Denaria protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.LINEA],
  fetch,
  start: "2025-12-15",
  // Linea vAMM sunset; trading moved to GMX V2 on Arbitrum (dexs/denaria-gmx.ts).
  deadFrom: "2026-09-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
