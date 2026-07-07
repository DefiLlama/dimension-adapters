import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";

const PREDICT_CONTRACT = "0xE4cea507b19796362A5a28Fa7cb705A3F1866213";
const SECONDARY_CONTRACT = "0x7E318ef37c3bC3d0cBA205Af2D1Fc9F9CeFEB5df";
const TOKEN = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34";

const PREDICTION_CREATED =
  "event PredictionCreated(bytes32 indexed predictionId, address indexed predictor, address indexed counterparty, address predictorToken, address counterpartyToken, uint256 predictorCollateral, uint256 counterpartyCollateral, bytes32 refCode, bytes32 pickConfigId)";

const TRADE_EXECUTED =
  "event TradeExecuted(bytes32 indexed tradeHash, address indexed seller, address indexed buyer, address token, address collateral, uint256 tokenAmount, uint256 price, bytes32 refCode)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const predictionLogs = await options.getLogs({
    target: PREDICT_CONTRACT,
    eventAbi: PREDICTION_CREATED,
  });

  for (const log of predictionLogs) {
    dailyVolume.add(TOKEN, log.predictorCollateral);
  }

  const tradeLogs = await options.getLogs({
    target: SECONDARY_CONTRACT,
    eventAbi: TRADE_EXECUTED,
  });

  for (const log of tradeLogs) {
    dailyVolume.add(log.collateral, log.price);
  }

  return { dailyVolume, dailyFees };
};

const methodology = {
  Volume:
    "Daily volume is the total predictor collateral committed in PredictionCreated events on the Meredian Predict contract, plus the trade price of secondary-market TradeExecuted events, on the Robinhood chain.",
  Fees: "Fees are set to 0 at the moment.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-01-01",
  methodology,
};

export default adapter;
