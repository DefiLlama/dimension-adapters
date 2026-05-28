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
  const dailyHoldersRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const pools = await api.fetchList({ lengthAbi: 'getPoolCount', itemAbi: 'pools', target: FACTORY });

  const logs = await fetchOptions.getLogs({
    targets: pools,
    eventAbi: eventAbis.swap,
  });

  // Current fee distribution ratios from Ryze Protocol
  // Swap Fees: 100% to UNIT holders (distributionAddress)
  // Taker Fees: 100% to Protocol
  // Slippage Fees: 50% Protocol, 50% UNIT holders
  // WBF Fees: 25% Protocol, 25% UNIT holders, 50% Treasury (not considered revenue/fees usually)

  logs.forEach((log: any) => {
    const tokenIn = log.tokenIn;
    const amountIn = log.amountIn;
    const feeDetails = log.feeDetails;

    // Arrays matching the tuple structure: [ [token, amount], [token, amount], ... ]
    // Index 0: swapFee, Index 1: takerFee, Index 2: wbfFee, Index 3: slippageFee, Index 4: wbrFee
    const swapFee = { token: feeDetails[0].token ?? feeDetails[0][0], amount: BigInt(feeDetails[0].amount ?? feeDetails[0][1]) };
    const takerFee = { token: feeDetails[1].token ?? feeDetails[1][0], amount: BigInt(feeDetails[1].amount ?? feeDetails[1][1]) };
    const wbfFee = { token: feeDetails[2].token ?? feeDetails[2][0], amount: BigInt(feeDetails[2].amount ?? feeDetails[2][1]) };
    const slippageFee = { token: feeDetails[3].token ?? feeDetails[3][0], amount: BigInt(feeDetails[3].amount ?? feeDetails[3][1]) };

    dailyVolume.add(tokenIn, amountIn);

    if (swapFee.amount > 0n) {
      dailyFees.add(swapFee.token, swapFee.amount, METRIC.SWAP_FEES);
      dailyHoldersRevenue.add(swapFee.token, swapFee.amount, 'Swap Fees To Holders');
    }

    if (takerFee.amount > 0n) {
      dailyFees.add(takerFee.token, takerFee.amount, 'Taker Fees');
      dailyProtocolRevenue.add(takerFee.token, takerFee.amount, 'Taker Fees To Protocol');
    }

    // Process WBF Fee (25% Protocol, 25% UNIT holders, 50% Treasury)
    if (wbfFee.amount > 0n) {
      dailyFees.add(wbfFee.token, wbfFee.amount, 'WBF Fees');

      const wbfProtocolAndTreasury = (wbfFee.amount * 75n) / 100n;
      const wbfHolders = (wbfFee.amount * 25n) / 100n;

      dailyProtocolRevenue.add(wbfFee.token, wbfProtocolAndTreasury, 'WBF Fees To Protocol And Treasury');
      dailyHoldersRevenue.add(wbfFee.token, wbfHolders, 'WBF Fees To Holders');
    }

    // Process Slippage Fee (50% Protocol, 50% UNIT holders)
    if (slippageFee.amount > 0n) {
      dailyFees.add(slippageFee.token, slippageFee.amount, 'Slippage Fees');

      const slippageProtocol = (slippageFee.amount * 50n) / 100n;
      const slippageHolders = slippageFee.amount - slippageProtocol;

      dailyProtocolRevenue.add(slippageFee.token, slippageProtocol, 'Slippage Fees To Protocol');
      dailyHoldersRevenue.add(slippageFee.token, slippageHolders, 'Slippage Fees To Holders');
    }
  });

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  };
}

const methodology = {
  Volume: "Daily volume is tracked by summing the amountIn of all Swap events across all Ryze pools.",
  Fees: "Daily fees are calculated by summing the swapFee, takerFee, wbfFee, and slippageFee emitted in Swap events.",
  Revenue: "Total Revenue equals UNIT holders Revenue plus Protocol Revenue.",
  HoldersRevenue: "UNIT holders receive 100% of Swap Fees, 25% of WBF Fees, and 50% of Slippage Fees.",
  ProtocolRevenue: "Protocol receives 100% of Taker Fees, 25% of WBF Fees, and 50% of Slippage Fees.",
  SupplySideRevenue: "LPs do not auto-compound fees; fees are routed to protocol, UNIT holders, and treasury.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fee charged on each swap.",
    'Taker Fees': "Taker fee charged on each swap.",
    'WBF Fees': "Weight Breaking Fee charged when a swap moves pool weights from target.",
    'Slippage Fees': "Captured slippage on each swap.",
  },
  Revenue: {
    'Swap Fees To Holders': "100% of Swap Fees distributed to UNIT holders.",
    'Taker Fees To Protocol': "100% of Taker Fees retained by the protocol.",
    'WBF Fees To Protocol And Treasury': "25% of WBF Fees retained by the protocol and 50% of WBF Fees distributed to treasury.",
    'WBF Fees To Holders': "25% of WBF Fees distributed to UNIT holders.",
    'Slippage Fees To Protocol': "50% of Slippage Fees distributed to protocol.",
    'Slippage Fees To Holders': "50% of Slippage Fees distributed to UNIT holders.",
  },
  HoldersRevenue: {
    'Swap Fees To Holders': "100% of Swap Fees distributed to UNIT holders.",
    'WBF Fees To Holders': "25% of WBF Fees distributed to UNIT holders.",
    'Slippage Fees To Holders': "50% of Slippage Fees distributed to UNIT holders.",
  },
  ProtocolRevenue: {
    'Taker Fees To Protocol': "100% of Taker Fees retained by the protocol.",
    'WBF Fees To Protocol And Treasury': "25% of WBF Fees retained by the protocol and 50% of WBF Fees distributed to treasury.",
    'Slippage Fees To Protocol': "50% of Slippage Fees distributed to protocol.",
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
