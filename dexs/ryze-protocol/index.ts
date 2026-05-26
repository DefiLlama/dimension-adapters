import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { sumTokens2 } from "../../helpers/unwrapLPs";
import { addOneToken } from "../../helpers/prices";

const FACTORY = '0xdf97B25A935EB72378e0C2D4DC15955ecE612b49';

// Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, FeeDetails feeDetails)
const SWAP_EVENT_SIGNATURE = '0x513dc41de89f1515e49db81e27a3e9d0dd7f27b37264f8e992617a4829b1a1c6';

async function tvl(api: any) {
  const pools = await api.fetchList({ lengthAbi: 'getPoolCount', itemAbi: 'pools', target: FACTORY });
  
  const poolAssets0 = await api.multiCall({ abi: 'function getPoolAsset(uint256) view returns (address token, uint256 balance, uint256 weight, uint8 decimals)', calls: pools.map((p: any) => ({ target: p, params: [0] })) });
  const poolAssets1 = await api.multiCall({ abi: 'function getPoolAsset(uint256) view returns (address token, uint256 balance, uint256 weight, uint8 decimals)', calls: pools.map((p: any) => ({ target: p, params: [1] })) });

  const tokensAndOwners: any[] = [];
  pools.forEach((pool: any, i: number) => {
    tokensAndOwners.push([poolAssets0[i].token, pool]);
    tokensAndOwners.push([poolAssets1[i].token, pool]);
  });

  return sumTokens2({ api, tokensAndOwners });
}

async function fetch(fetchOptions: FetchOptions) {
  const { api, createBalances } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  
  const pools = await api.fetchList({ lengthAbi: 'getPoolCount', itemAbi: 'pools', target: FACTORY });
  
  const logs = await fetchOptions.getLogs({
    targets: pools,
    topics: [SWAP_EVENT_SIGNATURE],
  });

  logs.forEach((log) => {
    // Topics:
    // 0: signature
    // 1: sender
    // 2: tokenIn
    // 3: tokenOut
    const tokenIn = '0x' + log.topics[2].slice(26);
    // const tokenOut = '0x' + log.topics[3].slice(26);
    
    // Data layout:
    // 0x00 - 0x20 (32 bytes): amountIn
    // 0x20 - 0x40 (32 bytes): amountOut
    // feeDetails struct starts here:
    // 0x40 - 0x60 (32 bytes): swapFee token address
    // 0x60 - 0x80 (32 bytes): swapFee amount
    // 0x80 - 0xa0 (32 bytes): takerFee token address
    // 0xa0 - 0xc0 (32 bytes): takerFee amount
    // 0xc0 - 0xe0 (32 bytes): wbfFee token address
    // 0xe0 - 0x100 (32 bytes): wbfFee amount
    // 0x100 - 0x120 (32 bytes): slippageFee token address
    // 0x120 - 0x140 (32 bytes): slippageFee amount
    // 0x140 - 0x160 (32 bytes): wbrFee token address
    // 0x160 - 0x180 (32 bytes): wbrFee amount
    
    // Remove "0x" prefix for slicing
    const data = log.data.slice(2);
    
    const amountIn = '0x' + data.slice(0, 64);
    
    const swapFeeToken = '0x' + data.slice(128 + 24, 192);
    const swapFeeAmount = '0x' + data.slice(192, 256);
    
    const takerFeeToken = '0x' + data.slice(256 + 24, 320);
    const takerFeeAmount = '0x' + data.slice(320, 384);
    
    const wbfFeeToken = '0x' + data.slice(384 + 24, 448);
    const wbfFeeAmount = '0x' + data.slice(448, 512);
    
    const slippageFeeToken = '0x' + data.slice(512 + 24, 576);
    const slippageFeeAmount = '0x' + data.slice(576, 640);
    
    // Add volume
    dailyVolume.add(tokenIn, amountIn);
    
    // Add fees
    if (swapFeeToken !== '0x0000000000000000000000000000000000000000') {
      dailyFees.add(swapFeeToken, swapFeeAmount);
    }
    if (takerFeeToken !== '0x0000000000000000000000000000000000000000') {
      dailyFees.add(takerFeeToken, takerFeeAmount);
    }
    if (wbfFeeToken !== '0x0000000000000000000000000000000000000000') {
      dailyFees.add(wbfFeeToken, wbfFeeAmount);
    }
    if (slippageFeeToken !== '0x0000000000000000000000000000000000000000') {
      dailyFees.add(slippageFeeToken, slippageFeeAmount);
    }
  });

  return {
    dailyVolume,
    dailyFees
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      tvl,
      fetch,
      start: '2024-11-20', // Approximate deploy date based on documentation
      meta: {
        methodology: {
          TVL: "TVL is calculated by summing the balances of all tokens in Ryze Protocol pools.",
          Volume: "Daily volume is tracked by summing the amountIn of all Swap events across all Ryze pools.",
          Fees: "Daily fees are calculated by summing the swapFee, takerFee, wbfFee, and slippageFee emitted in Swap events."
        }
      }
    }
  }
};

export default adapter;
