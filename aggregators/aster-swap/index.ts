import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const CONTRACT_ADDRESS = "0x268Eaa19eFCd6E7C1e15C76F131Ad8867a256366";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // SwapBuy(address indexed user, uint256 bnbIn, uint256 fee, uint256 tokensOut)
  const buyLogs = await options.getLogs({
    target: CONTRACT_ADDRESS,
    eventAbi: "event SwapBuy(address indexed user, uint256 bnbIn, uint256 fee, uint256 tokensOut)",
  });

  buyLogs.forEach((log) => {
    dailyVolume.addGasToken(log.bnbIn);
    dailyFees.addGasToken(log.fee);
  });

  // SwapSell(address indexed user, uint256 tokensIn, uint256 bnbOut, uint256 fee)
  const sellLogs = await options.getLogs({
    target: CONTRACT_ADDRESS,
    eventAbi: "event SwapSell(address indexed user, uint256 tokensIn, uint256 bnbOut, uint256 fee)",
  });

  sellLogs.forEach((log) => {
    // Volume: bnbOut + fee = bnbIn
    dailyVolume.addGasToken(Number(log.bnbOut) + Number(log.fee));
    dailyFees.addGasToken(log.fee);
  });

  // SwapTokenToToken(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 fee)
  const t2tLogs = await options.getLogs({
    target: CONTRACT_ADDRESS,
    eventAbi: "event SwapTokenToToken(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 fee)",
  });

  t2tLogs.forEach((log) => {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenIn, log.fee);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees, // Protocol fees + referrers
    dailyProtocolRevenue: dailyFees, // Or slightly less depending on referrers, but standard is tracking total taken
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    bsc: {
      fetch,
      start: '2026-04-20',
    },
  },
};

export default adapter;
