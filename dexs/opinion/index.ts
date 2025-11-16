import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OPINION_CONTRACT = "0x5F45344126D6488025B0b84A3A8189F2487a7246";
const OPINION_TREASURY_SAFE = "0xe76e763c5e57823ee5c7ed8e8d86d4e4938cbb4b";
const USDT_ON_BNB_CHAIN = "0x55d398326f99059fF775485246999027B3197955";
const ORDER_FILLED_EVENT =
  "event OrderFilled (bytes32 indexed orderHash,  address indexed maker,address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const orderFilledLogs = await options.getLogs({
    eventAbi: ORDER_FILLED_EVENT,
    target: OPINION_CONTRACT,
  });

  const usdtTransferLogs = await options.getLogs({
    eventAbi:
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    target: USDT_ON_BNB_CHAIN,
  });

  orderFilledLogs.forEach((order: any) => {
    const tradeVolume =
      Number(
        order.makerAssetId == 0
          ? order.makerAmountFilled
          : order.takerAmountFilled
      ) / 1e18;
    dailyVolume.addUSDValue(tradeVolume);
    dailyFees.addUSDValue(Number(order.fee) / 1e18);
  });

  usdtTransferLogs
    .filter((transfer: any) => transfer.to === OPINION_TREASURY_SAFE)
    .forEach((transfer: any) => {
      dailyRevenue.add(USDT_ON_BNB_CHAIN, Number(transfer.value) / 1e18);
    });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Volume: "Opinion prediction market trading volume",
  Fees: "Taker fees collected by opinion",
  Revenue: "All the fees are revenue",
  ProtocolRevenue: "All the revenue goes to protocol",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  chains: [CHAIN.BSC],
  start: "2025-10-22",
};

export default adapter;
