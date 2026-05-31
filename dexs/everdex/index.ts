import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const EVERDEX_V2_FACTORY = "0x19f21b0AB98EC10d734E314356Ad562ae349177d";
const abis = {
  v2SwapEvent: "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  tokenExchangeEvent: "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
  getFeeRateNumerator: "function getFeeRateNumerator(address) view returns (uint256)",
  getFeeRateDenominator: "function getFeeRateDenominator(address) view returns (uint256)",
  getProtocolFeeRate: "function getProtocolFeeRate(address) view returns (uint256)",
  stableFee: "uint256:fee",
  stableAdminFee: "uint256:admin_fee",
};

// Source: Everdex official pool API marks these direct deployments as CURVE_STABLE_SWAP.
const STABLE_SWAP_POOLS = {
  BTC_USD_USDC: {
    address: "0x840cf4522ed96cbbeb0924672ea170456eea3a4c",
    tokens: [
      "0x6906ccda405926fc3f04240187dd4fad5df6d555", // BTCUSD
      "0x640952e7984f2ecedead8fd97aa618ab1210a21c", // USDC
    ],
  },
  ST_BFC_WBFC: {
    address: "0x7fd303fca8c485955700ca7b5f71068878e8edba",
    tokens: [
      "0xeff8378c6419b50c9d87f749f6852d96d4cc5ae4", // stBFC
      "0x1c1b06405058abe02e4748753aed1458befee3b9", // WBFC
    ],
  },
  DAI_USDC_USDT: {
    address: "0xa455434802d8b530c77d2b7547ef93c798896581",
    tokens: [
      "0xcdb9579db96eb5c8298df889d915d0ff668aff2a", // DAI
      "0x640952e7984f2ecedead8fd97aa618ab1210a21c", // USDC
      "0x3ea8654d5755e673599473ab37d92788b5ba12ae", // USDT
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const v2Result = await getUniV2LogAdapter({
    factory: EVERDEX_V2_FACTORY,
    fees: 0,
    allowReadPairs: true,
    customLogic: async ({ pairObject, dailyVolume: swapVolume, filteredPairs, fetchOptions }: any) => {
      const pairIds = Object.keys(filteredPairs);
      const swapFees = fetchOptions.createBalances();
      const protocolRevenue = fetchOptions.createBalances();
      const supplySideRevenue = fetchOptions.createBalances();

      // V2 fee rates are configured per pair in the factory, so they cannot be a single constant.
      const [logs, feeNumerators, feeDenominators, protocolFeeRates] = await Promise.all([
        fetchOptions.getLogs({ targets: pairIds, eventAbi: abis.v2SwapEvent, flatten: false }),
        fetchOptions.api.multiCall({ target: EVERDEX_V2_FACTORY, abi: abis.getFeeRateNumerator, calls: pairIds, permitFailure: true }),
        fetchOptions.api.multiCall({ target: EVERDEX_V2_FACTORY, abi: abis.getFeeRateDenominator, calls: pairIds, permitFailure: true }),
        fetchOptions.api.multiCall({ target: EVERDEX_V2_FACTORY, abi: abis.getProtocolFeeRate, calls: pairIds, permitFailure: true }),
      ]);

      logs.forEach((pairLogs: any[], index: number) => {
        if (!pairLogs.length || feeNumerators[index] == undefined || feeDenominators[index] == undefined || protocolFeeRates[index] == undefined) return;
        const [token0, token1] = pairObject[pairIds[index]];
        const totalFee = Number(feeNumerators[index]) / Number(feeDenominators[index]);
        const protocolFee = Number(protocolFeeRates[index]) / Number(feeDenominators[index]);
        const supplySideFee = totalFee - protocolFee;

        pairLogs.forEach((log: any) => {
          const amount0 = Number(log.amount0In) + Number(log.amount0Out);
          const amount1 = Number(log.amount1In) + Number(log.amount1Out);

          addOneToken({ chain: fetchOptions.chain, balances: swapFees, token0, token1, amount0: amount0 * totalFee, amount1: amount1 * totalFee });
          addOneToken({ chain: fetchOptions.chain, balances: protocolRevenue, token0, token1, amount0: amount0 * protocolFee, amount1: amount1 * protocolFee });
          addOneToken({ chain: fetchOptions.chain, balances: supplySideRevenue, token0, token1, amount0: amount0 * supplySideFee, amount1: amount1 * supplySideFee });
        });
      });

      return { swapVolume, swapFees, protocolRevenue, supplySideRevenue };
    },
  })(options);
  const { swapVolume, swapFees, protocolRevenue, supplySideRevenue } = v2Result;

  const pools = Object.values(STABLE_SWAP_POOLS);
  // Stable swap fees are configured on each direct pool deployment.
  const [stableLogs, stableFeeRates, stableAdminFees] = await Promise.all([
    options.getLogs({
      targets: pools.map(({ address }) => address),
      eventAbi: abis.tokenExchangeEvent,
      flatten: false,
    }),
    options.api.multiCall({ abi: abis.stableFee, calls: pools.map(({ address }) => address), permitFailure: true }),
    options.api.multiCall({ abi: abis.stableAdminFee, calls: pools.map(({ address }) => address), permitFailure: true }),
  ]);

  for (const [index, logs] of stableLogs.entries()) {
    const { tokens } = pools[index];
    if (!logs.length || stableFeeRates[index] == undefined || stableAdminFees[index] == undefined) continue;
    const fee = Number(stableFeeRates[index]) / 1e10;
    const protocolFee = fee * (Number(stableAdminFees[index]) / 1e10);
    const supplySideFee = fee - protocolFee;

    logs.forEach((log: any) => {
      const token0 = tokens[Number(log.sold_id)];
      const token1 = tokens[Number(log.bought_id)];

      addOneToken({
        chain: options.chain,
        balances: swapVolume,
        token0,
        token1,
        amount0: log.tokens_sold,
        amount1: log.tokens_bought,
      });

      const tokensSold = Number(log.tokens_sold);
      const tokensBought = Number(log.tokens_bought);
      addOneToken({ chain: options.chain, balances: swapFees, token0, token1, amount0: tokensSold * fee, amount1: tokensBought * fee });
      addOneToken({ chain: options.chain, balances: protocolRevenue, token0, token1, amount0: tokensSold * protocolFee, amount1: tokensBought * protocolFee });
      addOneToken({ chain: options.chain, balances: supplySideRevenue, token0, token1, amount0: tokensSold * supplySideFee, amount1: tokensBought * supplySideFee });
    });
  }

  dailyVolume.addBalances(swapVolume);
  dailyFees.addBalances(swapFees, "Swap Fees");
  dailyProtocolRevenue.addBalances(protocolRevenue, "Swap Fees to Protocol");
  dailySupplySideRevenue.addBalances(supplySideRevenue, "Swap Fees to LPs");

  return { dailyVolume, dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  dailyVolume: "All swaps through Everdex V2 pairs and stable swap pools.",
  dailyFees: "Total swap fees paid by traders.",
  dailyRevenue: "Protocol share of swap fees.",
  dailyProtocolRevenue: "Protocol share of swap fees.",
  dailySupplySideRevenue: "Swap fees earned by liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Total fees paid on swaps.",
  },
  Revenue: {
    "Swap Fees to Protocol": "Fees kept by the protocol.",
  },
  ProtocolRevenue: {
    "Swap Fees to Protocol": "Fees kept by the protocol.",
  },
  SupplySideRevenue: {
    "Swap Fees to LPs": "Fees paid to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2024-04-17",
  chains: [CHAIN.BFC],
  methodology,
  breakdownMethodology,
};

export default adapter;
