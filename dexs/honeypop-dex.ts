import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const FACTORY = "0x1d25AF2b0992bf227b350860Ea80Bad47382CAf6";

const protocolFeePools: Array<{ revenueRatio: number; pools: string[] }> = [
  {
    revenueRatio: 0.25,
    pools: [
      "0x2294650d0fA0Cdd9CfB9cF9fFADE6C23C68740D7", // USX/USDC 0.05%
      "0x2F4c290ac9C7B8617857239C46048f81395215Da", // USDC/EURC 0.05%
    ],
  },
  {
    revenueRatio: 0.1,
    pools: [
      "0x71A1aD616680836DBf4248FA8a5F6A60A3937F89", // WETH/USDT 0.30%
      "0x7574Bc9BaC08F22df6B1542B9A85686e825D58D5", // WETH/USDT 0.05%
      "0x0edA2b3C3BC5E6DDeF352beFA4Fc9C9Ca7e7D022", // ETHFI/WETH 0.30%
      "0x85b605af90cAd4890e674CFcAAff6a9f7825fA2d", // USDC/SCR 0.30%
    ],
  },
  {
    revenueRatio: 1 / 6,
    pools: [
      "0x04566Bf83399E4F750728d1ef57008AedDA00E71", // USDC/WETH 0.05%
      "0x3eBF5717d34c363dFB29e14466B33DeAc8dda5E3", // USDC/WETH 0.30%
      "0xF8DF1399B91DD48f0b7DCAbDBed08473c285aF7e", // weETH/WETH 0.05%
    ],
  },
];

const fetch = async (options: FetchOptions) => {
  const baseAdapter = getUniV3LogAdapter({
    factory: FACTORY,
    userFeesRatio: 1,
  });
  const result = await baseAdapter(options);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addBalances(result.dailyFees, "Swap Fees");
  dailyUserFees.addBalances(result.dailyFees, "Swap Fees");

  for (const config of protocolFeePools) {
    const protocolPoolAdapter = getUniV3LogAdapter({
      pools: config.pools,
      revenueRatio: config.revenueRatio,
      protocolRevenueRatio: config.revenueRatio,
    });
    const protocolPoolResult = await protocolPoolAdapter(options);

    dailyRevenue.addBalances(protocolPoolResult.dailyRevenue, "Swap Fees To Protocol");
  }

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(result.dailyFees, "Swap Fees To LPs");
  dailySupplySideRevenue.subtract(dailyRevenue, "Swap Fees To LPs");

  return {
    dailyVolume: result.dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "Only listed protocol-fee pools share a portion of swap fees with the protocol. All other pools send 100% of swap fees to LPs.",
    ProtocolRevenue: "Protocol revenue is the configured protocol share of swap fees for the listed pools.",
    SupplySideRevenue: "LP revenue is total swap fees minus the protocol share from listed protocol-fee pools.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap Fees": "Swap fees paid by users.",
    },
    UserFees: {
      "Swap Fees": "Swap fees paid by users.",
    },
    Revenue: {
      "Swap Fees To Protocol": "Protocol share of swap fees from the listed protocol-fee pools.",
    },
    ProtocolRevenue: {
      "Swap Fees To Protocol": "Protocol share of swap fees from the listed protocol-fee pools.",
    },
    SupplySideRevenue: {
      "Swap Fees To LPs": "Swap fees distributed to liquidity providers after protocol-fee splits.",
    },
  },
  adapter: {
    [CHAIN.SCROLL]: {
      fetch,
    },
  },
};

export default adapter;
