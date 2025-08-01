import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to, uint256 amountTokenFee, uint256 amountTokenReward)';

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x6D1063F2187442Cc9adbFAD2f55A96B846FCB399', swapEvent }),
  chains: [CHAIN.LINEA],
  start: 1689638400,
}

export default adapter;