import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const CFO_ROUTER = '0xf4f7b6400DB5D121194BdA173d8b8727B295207F';

const eventAbi = "event OrderRecord(address fromToken, address toToken, address sender, uint256 fromAmount, uint256 returnAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: CFO_ROUTER,
    eventAbi,
  });
  logs.forEach((log: any) => {
    if (log.toToken.toLowerCase() === ADDRESSES.GAS_TOKEN_2) dailyVolume.addGasToken(log.returnAmount);
    else dailyVolume.add(log.toToken, log.returnAmount);
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-09-24',
  methodology: {
    Volume: 'Volume is the output token amount each swap delivered, read from the returnAmount of OrderRecord events emitted by CfoRouter. The declared input amount is not used because the router does not check it against the tokens it pulls.'
  }
};

export default adapter;
