import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { getProvider } from "@defillama/sdk";
import { ethers } from "ethers";

const contractAddress = "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0";
const ROUTER_ADDRESS = "0x96E0fE5927172a66c2d947981802dd048eC65fB7";
const WLD_ADDRESS = "0x2cfc85d8e48f8eab294be644d9e25c3030863003";

const event_fillQuoteEthToToken =
  "event FillQuoteEthToToken(address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToEth =
  "event FillQuoteTokenToEth(address indexed sellToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToToken =
  "event FillQuoteTokenToToken(address indexed sellToken,address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint8 feeToken,uint256 feeAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const [
    log_fillQuoteEthToToken,
    log_fillQuoteTokenToEth,
    log_fillQuoteTokenToToken,
  ] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteEthToToken, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToEth, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToToken, }),
  ]);

  log_fillQuoteEthToToken.forEach((log) => {
    dailyVolume.addGasToken(log.amountSold)
    dailyVolume.addGasToken(log.feeAmount)
  })

  log_fillQuoteTokenToEth.forEach((log) => {
    dailyVolume.addGasToken(log.amountBought)
    dailyVolume.addGasToken(log.feeAmount)
  })

  log_fillQuoteTokenToToken.forEach((log) => {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.sellToken, amount0: log.amountSold, token1: log.buyToken, amount1: log.amountBought })
    const feeToken = log.feeToken === 0n ? log.sellToken : log.buyToken
    dailyFees.addToken(feeToken, log.feeAmount)
  })

  const provider = getProvider(CHAIN.WC);
  const iface = new ethers.Interface(['function swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline)'])
  const { getToBlock, getFromBlock } = options;
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);

  for (let i = fromBlock; i <= toBlock; i++) {
    const block = await provider.getBlock(i);
    if (!block) continue;
    for (const transactionHash of block.transactions) {
      const tx = await provider.getTransaction(transactionHash) as any;
      if (!tx || !tx.to || !tx.data) continue;
      // check if the transaction is a swap on the router contract
      // and decode the input data to extract swap details
      if (tx.to?.toLowerCase() === ROUTER_ADDRESS.toLowerCase() &&
        tx.data.startsWith(iface.getFunction('swapTokensForExactTokens'))) {
          const data = tx!.input
          const decodedInput = iface.decodeFunctionData('swapTokensForExactTokens', data)
          const { amountOut, amountInMax, path, to, deadline } = decodedInput
          if (!path || path.length < 2) continue

          const isTokenAtStart = path[0].toLowerCase() === WLD_ADDRESS.toLowerCase();
          const isTokenAtEnd = path[path.length - 1].toLowerCase() === WLD_ADDRESS.toLowerCase();

          if (!isTokenAtStart && !isTokenAtEnd) continue;

          const volume = isTokenAtStart ? amountInMax : amountOut;
          dailyVolume.addToken(WLD_ADDRESS, volume);
      }
    }
  }

  return {
    dailyVolume, dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: "2025-04-16",
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
