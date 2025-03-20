import { ChainApi } from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import axios from "axios";
import BigNumber from "bignumber.js";
import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const ABI = {
  feeAccruedEvent: "event YieldFeeAccrued(uint256 fee)",
  poolSwapEvent:
    "event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 fee, uint256 packed_price_scale)",
};

async function fetchMarkets(api: ChainApi): Promise<FetchMarketsResult> {
  const url = `https://api-v2.napier.finance/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<any[]>(url);

  const rewardTokensDuplicated = res.data.flatMap((m) =>
    m.metrics.underlyingRewards.map((r: any) => r.rewardToken.address)
  );
  const rewardTokens = [...new Set(rewardTokensDuplicated)];

  return {
    rewardTokens,
    marketInfos: res.data.map((m) => ({
      address: m.metadata.address,
      poolAddress: m.tokens.poolToken.id,
      underlying: m.tokens.targetToken.id,
      splitFeePct: new BigNumber(m.fees.splitFeePercentage),
      rewardTokens: m.metrics.underlyingRewards.map(
        (r: any) => r.rewardToken.address
      ),
    })),
  };
}

export type FetchMarketsResult = {
  rewardTokens: string[];
  marketInfos: MarketInfo[];
};

export type MarketInfo = {
  address: string;
  poolAddress: string;
  underlying: string;
  splitFeePct: BigNumber;
  rewardTokens: string[];
};

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    options: FetchOptions
  ): Promise<FetchResultFees> => {
    const { getLogs, createBalances } = options;

    const { marketInfos, rewardTokens } = await fetchMarkets(options.api);
    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens,
    });

    const allFeeAccruedEvents = await getLogs({
      targets: marketInfos.map((m) => m.address),
      eventAbi: ABI.feeAccruedEvent,
      flatten: false,
    });

    const allPoolSwapEvents = await getLogs({
      targets: marketInfos.map((m) => m.poolAddress),
      eventAbi: ABI.poolSwapEvent,
      flatten: false,
    });

    marketInfos.forEach((marketInfo, i) => {
      const token = marketInfo.underlying;
      const fees = allFeeAccruedEvents[i];
      const swapEvents = allPoolSwapEvents[i];

      fees.forEach(([fee]: bigint[]) => {
        const feeBn = new BigNumber(fee.toString());
        const curatorFeeBn = feeBn
          .times(marketInfo.splitFeePct)
          .dividedToIntegerBy(100);

        dailyFees.add(token!, feeBn);
        dailySupplySideRevenue.add(token!, curatorFeeBn.toNumber());
        dailyRevenue.add(token!, feeBn.minus(curatorFeeBn));
      });

      swapEvents.forEach((eventData: bigint[]) => {
        const boughtId = eventData[3];
        const fee = eventData[5];
        const feeBn = new BigNumber(fee.toString());
        const tokenAddress =
          Number(boughtId) === 0 ? marketInfo.underlying : marketInfo.address;

        // All swap fees go to LPs/Curve, nothing to protocol revenue
        dailyFees.add(tokenAddress, feeBn);
        dailySupplySideRevenue.add(tokenAddress, feeBn);
      });
    });

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      timestamp,
    };
  };
};

const methodology = {
  UserFees:
    "Users pay multiple types of fees: issuance fee, performance fee, redemption fee, and swap fee",
  Fees: "Total of all fees paid by users including issuance, performance, redemption, and swap fees",
  Revenue:
    "A portion of all fees (except swap fees) is collected by the protocol based on the split fee percentage",
  ProtocolRevenue:
    "Protocol revenue is the portion of fees not distributed to curators, determined by the split fee percentage",
  SupplySideRevenue:
    "Curators receive a percentage of the fees as specified by each pool's splitFeePercentage. Additionally, swap fees go to liquidity providers/Curve and are counted as supply side revenue",
};

const chainConfig: Record<Chain, Config> = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-28",
  },
  [CHAIN.BASE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-27",
  },
  [CHAIN.SONIC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-07",
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.FRAXTAL]: {
    treasury: "0x8C244F488A742365ECB5047E78c29Ac2221ac0bf",
    start: "2024-03-11",
  },
  [CHAIN.MANTLE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.BSC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.POLYGON]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.AVAX]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
};

type Config = {
  treasury: string;
  start: string;
};

const adapter: SimpleAdapter = {
  adapter: {
    ...Object.fromEntries(
      Object.entries(chainConfig).map(([chain, config]) => [
        chain,
        {
          fetch: fetch(chain as Chain),
          start: config.start,
          meta: {
            methodology,
          },
        },
      ])
    ),
  },
};

export default adapter;
