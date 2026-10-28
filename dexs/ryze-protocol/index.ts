import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FACTORY = '0xdf97B25A935EB72378e0C2D4DC15955ecE612b49';

const eventAbis = {
  swap: 'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, tuple(tuple(address token, uint256 amount) swapFee, tuple(address token, uint256 amount) takerFee, tuple(address token, uint256 amount) wbfFee, tuple(address token, uint256 amount) slippageFee, tuple(address token, uint256 amount) wbrFee) feeDetails)'
};

async function fetch(fetchOptions: FetchOptions) {
  const { api, createBalances } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const pools = await api.fetchList({ lengthAbi: 'getPoolCount', itemAbi: 'pools', target: FACTORY });

  const logs = await fetchOptions.getLogs({
    targets: pools,
    eventAbi: eventAbis.swap,
  });

  // Fee routing verified on-chain (pool contract is unverified on Basescan):
  //   swapFee    100% -> liquidity providers (collector 0x3fe1 forwards to the Smart-Vault that holds the pool LP token)
  //   takerFee   100% -> protocol (0xd7c0)
  //   wbfFee     25% LPs, 25% protocol, 50% Bonus Vault (0x8280) which pays it back to rebalancing traders as Weight Balance Rewards
  //   slippage   50% LPs, 50% protocol
  // UNIT Economy is not live, so there is no token-holder revenue.

  logs.forEach((log: any) => {
    const tokenIn = log.tokenIn;
    const amountIn = log.amountIn;
    const feeDetails = log.feeDetails;

    // Index 0: swapFee, 1: takerFee, 2: wbfFee, 3: slippageFee, 4: wbrFee
    // wbrFee (index 4) is a reward PAID OUT to rebalancing traders (denominated in tokenOut), not a charged fee — intentionally excluded from dailyFees.
    const swapFee = { token: feeDetails[0].token ?? feeDetails[0][0], amount: BigInt(feeDetails[0].amount ?? feeDetails[0][1]) };
    const takerFee = { token: feeDetails[1].token ?? feeDetails[1][0], amount: BigInt(feeDetails[1].amount ?? feeDetails[1][1]) };
    const wbfFee = { token: feeDetails[2].token ?? feeDetails[2][0], amount: BigInt(feeDetails[2].amount ?? feeDetails[2][1]) };
    const slippageFee = { token: feeDetails[3].token ?? feeDetails[3][0], amount: BigInt(feeDetails[3].amount ?? feeDetails[3][1]) };

    dailyVolume.add(tokenIn, amountIn);

    // Swap fee — the LP trading fee, 100% to liquidity providers
    if (swapFee.amount > 0n) {
      dailyFees.add(swapFee.token, swapFee.amount, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(swapFee.token, swapFee.amount, 'Swap Fees To LPs');
    }

    // Taker fee — 100% to protocol
    if (takerFee.amount > 0n) {
      dailyFees.add(takerFee.token, takerFee.amount, 'Taker Fees');
      dailyProtocolRevenue.add(takerFee.token, takerFee.amount, 'Taker Fees To Protocol');
    }

    // Weight Breaking Fee — 25% LPs, 25% protocol, 50% paid back to rebalancing traders (Weight Balance Rewards)
    if (wbfFee.amount > 0n) {
      dailyFees.add(wbfFee.token, wbfFee.amount, 'WBF Fees');

      const wbfLps = (wbfFee.amount * 25n) / 100n;
      const wbfProtocol = (wbfFee.amount * 25n) / 100n;
      const wbfRebalancers = wbfFee.amount - wbfLps - wbfProtocol; // 50%, remainder to avoid rounding loss

      dailySupplySideRevenue.add(wbfFee.token, wbfLps, 'WBF Fees To LPs');
      dailyProtocolRevenue.add(wbfFee.token, wbfProtocol, 'WBF Fees To Protocol');
      dailySupplySideRevenue.add(wbfFee.token, wbfRebalancers, 'WBF Fees To Rebalancing Traders');
    }

    // Slippage fee — 50% LPs, 50% protocol
    if (slippageFee.amount > 0n) {
      dailyFees.add(slippageFee.token, slippageFee.amount, 'Slippage Fees');

      const slippageProtocol = (slippageFee.amount * 50n) / 100n;
      const slippageLps = slippageFee.amount - slippageProtocol;

      dailySupplySideRevenue.add(slippageFee.token, slippageLps, 'Slippage Fees To LPs');
      dailyProtocolRevenue.add(slippageFee.token, slippageProtocol, 'Slippage Fees To Protocol');
    }
  });

  const dailyRevenue = dailyProtocolRevenue.clone(); // no holders revenue while UNIT Economy is not live

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Sum of the input amount of every swap across all Ryze pools.",
  Fees: "Every fee charged on a swap: the swap fee, taker fee, weight-breaking fee, and captured slippage.",
  Revenue: "What the protocol keeps: 100% of taker fees, 25% of weight-breaking fees, and 50% of captured slippage. There is no token-holder revenue yet — UNIT distribution is not live.",
  ProtocolRevenue: "The protocol's share: 100% of taker fees, 25% of weight-breaking fees, and 50% of captured slippage.",
  SupplySideRevenue: "Paid to liquidity providers: 100% of swap fees, 25% of weight-breaking fees, and 50% of captured slippage. The other 50% of weight-breaking fees is paid back to traders who rebalance the pool (Weight Balance Rewards).",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fee charged on each trade (the LP trading fee).",
    'Taker Fees': "Taker fee charged on each trade.",
    'WBF Fees': "Weight-breaking fee charged when a trade pushes pool weights away from target.",
    'Slippage Fees': "Slippage captured on each trade.",
  },
  Revenue: {
    'Taker Fees To Protocol': "100% of taker fees.",
    'WBF Fees To Protocol': "25% of weight-breaking fees.",
    'Slippage Fees To Protocol': "50% of captured slippage.",
  },
  ProtocolRevenue: {
    'Taker Fees To Protocol': "100% of taker fees.",
    'WBF Fees To Protocol': "25% of weight-breaking fees.",
    'Slippage Fees To Protocol': "50% of captured slippage.",
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': "100% of swap fees go to liquidity providers.",
    'WBF Fees To LPs': "25% of weight-breaking fees go to liquidity providers.",
    'WBF Fees To Rebalancing Traders': "50% of weight-breaking fees are paid back to traders who rebalance the pool (Weight Balance Rewards).",
    'Slippage Fees To LPs': "50% of captured slippage goes to liquidity providers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-04-12',
  methodology,
  breakdownMethodology,
};

export default adapter;
