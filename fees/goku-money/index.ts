import * as sdk from "@defillama/sdk";
import { Adapter, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";
import axios, { AxiosResponse } from "axios";
import BigNumber from "bignumber.js";

interface DexScreenerResponse {
  pairs: {
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceUsd: string;
  }[];
}

interface PriceInfo {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}

interface Feed {
  id: string;
  price: PriceInfo;
  ema_price: PriceInfo;
}

const BORROW_CONTRACT_ADDRESS = [
  "0x2f6E14273514bc53deC831028CB91cB1D7b78237", // USDC
  "0x2D18cE2adC5B7c4d8558b62D49A0137A6B87049b", // USDT
  "0x7519eC4d295Ca490EaC618a80B3cc42c258F6000", // WETH
  "0xEC52881A8AEbFEB5576c08FBD1e4203f51B36524", // TIA
  "0x95CeF13441Be50d20cA4558CC0a27B601aC544E5", // MANTA
];

const GAI_PAID_TOPIC = [
  "0x82db03bc05d9c2d04d268827ae58bb9dbfeec9acae002850df31476dfa0e0364", // USDC GAIBorrowingFeePaid
];

const COLLATERAL_REDEMPTION_FEE = [
  "0x43a3f4082a4dbc33d78e317d2497d3a730bc7fc3574159dcea1056e62e5d9ad8", // Redemption Topic
];

const PYTH_PRICE_FEED_IDS = [
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC
  "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b", // USDT
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // WETH
  "0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723", // TIA
  "0xc3883bcf1101c111e9fcfe2465703c47f2b638e21fef2cce0502e6c8f416e0e2", // MANTA
];

const GAI_TOKEN_DECIMAL = 18;
const PYTH_CONFIG = {
  USDC: {
    contractAddress: "0x5B27B4ACA9573F26dd12e30Cb188AC53b177006e",
    priceFeedId:
      "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    decimal: 6,
    revenue: BigNumber(0),
  },
  USDT: {
    contractAddress: "0x2D18cE2adC5B7c4d8558b62D49A0137A6B87049b",
    priceFeedId:
      "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
    decimal: 6,
    revenue: BigNumber(0),
  },
  WETH: {
    contractAddress: "0x17Efd0DbAAdc554bAFDe3cC0E122f0EEB94c8661",
    priceFeedId:
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    decimal: 18,
    revenue: BigNumber(0),
  },
  TIA: {
    contractAddress: "0xaa41F9e1f5B6d27C22f557296A0CDc3d618b0113",
    priceFeedId:
      "0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723",
    decimal: 9,
    revenue: BigNumber(0),
  },
  MANTA: {
    contractAddress: "0x3683Ee89f1928B69962D20c08315bb7059C21dD9",
    priceFeedId:
      "0xc3883bcf1101c111e9fcfe2465703c47f2b638e21fef2cce0502e6c8f416e0e2",
    decimal: 18,
    revenue: BigNumber(0),
  },
};
type PYTH_CONFIG_TYPE = typeof PYTH_CONFIG;
type PYTH_CONFIG_KEYS = keyof PYTH_CONFIG_TYPE;

const fetchGAIPrice = async () => {
  try {
    const response: AxiosResponse<DexScreenerResponse> = await axios.get(
      "https://api.dexscreener.com/latest/dex/tokens/0xcd91716ef98798A85E79048B78287B13ae6b99b2"
    );
    return response.data.pairs[0].priceUsd ?? "1";
  } catch (error) {
    return "1";
  }
};

const fetchPriceFeeds = async (): Promise<Record<string, string>> => {
  const baseURL = "https://hermes.pyth.network/";
  const resource = "api/latest_price_feeds";
  const params = new URLSearchParams();

  PYTH_PRICE_FEED_IDS.forEach((id) => params.append("ids[]", id));

  const response = await axios.get<Feed[]>(`${baseURL}${resource}`, {
    params: params,
  });

  // price array to price map
  // key is price feed id
  // value is price in standard unit like $1.00
  return response.data.reduce((acc, curr) => {
    const adjustedPrice =
      Number(curr.price.price) * Math.pow(10, curr.price.expo);
    acc[curr.id] = adjustedPrice.toFixed(Math.abs(curr.price.expo));
    return acc;
  }, {} as Record<string, string>);
};

const fetchGaiRevenue = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;

  // open vault fee
  const eventABI = [
    "event GAIBorrowingFeePaid(address indexed _borrower, uint256 _GAIFee)",
  ];

  const iface = new ethers.Interface(eventABI);

  const fromBlock = await getBlock(fromTimestamp, CHAIN.MANTA as Chain, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.MANTA as Chain, {});

  let totalGaiPaid = BigNumber(0);

  for (const address of BORROW_CONTRACT_ADDRESS) {
    const logs = await sdk.getEventLogs({
      target: address,
      topic: "",
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.MANTA as Chain,
      topics: GAI_PAID_TOPIC,
    });

    for (const log of logs) {
      if (!Array.isArray(log)) {
        const event = iface.parseLog(log as any);
        event!.args.forEach((arg, index) => {
          if (!arg.toString().startsWith("0x") && index === 1) {
            totalGaiPaid = totalGaiPaid.plus(BigNumber(arg));
          }
        });
      }
    }
  }
  const gaiCounts = ethers.formatUnits(
    totalGaiPaid.toString(),
    GAI_TOKEN_DECIMAL
  );
  const gaiUsd = await fetchGAIPrice();
  const gaiRevenue = (parseFloat(gaiCounts) * parseFloat(gaiUsd)).toFixed(6);
  return gaiRevenue;
};

const fetchCollateralRedemptionRevenue = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;

  // redemption fee
  const eventABI = [
    "event Redemption(uint256 _attemptedGAIAmount, uint256 _actualGAIAmount, uint256 _COLSent, uint256 _COLFee)",
  ];

  const iface = new ethers.Interface(eventABI);

  const fromBlock = await getBlock(fromTimestamp, CHAIN.MANTA as Chain, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.MANTA as Chain, {});

  for (const token of Object.keys(PYTH_CONFIG) as PYTH_CONFIG_KEYS[]) {
    const logs = await sdk.getEventLogs({
      target: PYTH_CONFIG[token].contractAddress,
      topic: "",
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.MANTA as Chain,
      topics: COLLATERAL_REDEMPTION_FEE,
    });

    for (const log of logs) {
      if (!Array.isArray(log)) {
        const event = iface.parseLog(log as any);
        event!.args.forEach((arg, index) => {
          if (BigNumber.isBigNumber(arg) && index === 3) {
            PYTH_CONFIG[token].revenue = PYTH_CONFIG[token].revenue.plus(arg);
          }
        });
      }
    }
  }

  const priceFeeds = await fetchPriceFeeds();

  let totalValue = 0.0;

  Object.values(PYTH_CONFIG).forEach(({ priceFeedId, decimal, revenue }) => {
    const price = priceFeeds[priceFeedId.substring(2)];
    if (price) {
      const revenueInStandardUnit = ethers.formatUnits(
        revenue.toString(),
        decimal
      );
      totalValue += parseFloat(revenueInStandardUnit) * parseFloat(price);
    }
  });

  return totalValue.toFixed(6);
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MANTA]: {
      fetch: async (timestamp: number, _: ChainBlocks) => {
        const gaiRevenue = await fetchGaiRevenue(timestamp);

        const collateralRevenue = await fetchCollateralRedemptionRevenue(
          timestamp
        );

        const totalRevenue = (
          parseFloat(collateralRevenue) + parseFloat(gaiRevenue)
        ).toFixed(6);
        return {
          timestamp,
          dailyFees: totalRevenue,
          dailyRevenue: totalRevenue,
          dailyHoldersRevenue: totalRevenue,
        };
      },
      start: async () => 1698768000, // 01 Nov 2023
    },
  },
};

export default adapter;
