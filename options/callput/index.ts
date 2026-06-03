import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CallPut — GMX-style on-chain options protocol (Base).
// The Controller emits a per-trade USD delta for both notional and premium.
const CONTROLLER = "0xfc61ba50AE7B9C4260C9f04631Ff28D5A2Fa4EB2";

// Emitted uint256 = size * price / 10**decimals, where price carries 1e30
// precision, so each value is the USD amount scaled by 1e30.
const PRICE_PRECISION = 1e30;

const NOTIONAL_VOLUME_ABI =
  "event IncreaseAccumulatedNotionalVolume(uint16 indexed underlyingAssetIndex, bool indexed isCall, uint256 notionalVolume)";
const EXECUTION_PRICE_ABI =
  "event IncreaseAccumulatedExecutionPrice(uint16 indexed underlyingAssetIndex, bool indexed isCall, uint256 totalExecutionPrice)";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const [notionalLogs, premiumLogs] = await Promise.all([
    options.getLogs({ target: CONTROLLER, eventAbi: NOTIONAL_VOLUME_ABI }),
    options.getLogs({ target: CONTROLLER, eventAbi: EXECUTION_PRICE_ABI }),
  ]);

  for (const log of notionalLogs)
    dailyNotionalVolume.addUSDValue(Number(log.notionalVolume) / PRICE_PRECISION);

  for (const log of premiumLogs)
    dailyPremiumVolume.addUSDValue(Number(log.totalExecutionPrice) / PRICE_PRECISION);

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    NotionalVolume:
      "Sum of IncreaseAccumulatedNotionalVolume events emitted by the CallPut Controller on each trade (size * spot price), denominated in USD.",
    PremiumVolume:
      "Sum of IncreaseAccumulatedExecutionPrice events emitted by the CallPut Controller on each trade (size * execution price) — the option premium paid — denominated in USD.",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      // First Controller volume event on Base (matches the Dune dashboard start).
      start: "2026-01-30",
    },
  },
};

export default adapter;
