import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const PREDICT_FEE_TREASURY = "0x7625B1c374b0D1546d87c0ab66229461007f1e33";

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const fees = await addTokensReceived({
    options,
    targets: [PREDICT_FEE_TREASURY],
    tokens: [USDT_BSC],
  });

  dailyFees.addBalances(fees);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Predict.fun charges taker-only trading fees on prediction market trades. Fees are finalized at settlement and collected in USDT.",
  UserFees: "Taker fees paid by users when executing trades on Predict.fun markets.",
  Revenue: "All collected trading fees are retained by the protocol.",
  ProtocolRevenue: "100% of fees are protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2025-12-10",
  methodology,
};

export default adapter;
