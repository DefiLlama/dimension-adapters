import { ChainApi } from "@defillama/sdk";
import { Chain } from "../adapters/types";
import axios from "axios";
import BigNumber from "bignumber.js";
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const ABI = {
  feeAccruedEvent: "event YieldFeeAccrued(uint256 fee)",
};

async function fetchMarkets(api: ChainApi): Promise<FetchMarketsResult> {
  const url = `https://api-v2.napier.finance/v1/market?chainIds=${api.chainId!}`;
  const res = await axios.get<any[]>(url);

  const markets = res.data.map((m) => m.metadata.address);
  const marketToUnderlying = new Map(res.data.map((m) => [m.metadata.address, m.tokens.targetToken.id]));
  const splitFeePcts = res.data.map((m) => new BigNumber(m.fees.splitFeePercentage));

  const rewardTokensDuplicated = res.data.flatMap((m) =>
    m.metrics.underlyingRewards.map((r: any) => r.rewardToken.address)
  );
  const rewardTokens = [...new Set(rewardTokensDuplicated)];

  return { markets, marketToUnderlying, splitFeePcts, rewardTokens };
}

export type FetchMarketsResult = {
  markets: string[];
  marketToUnderlying: Map<string, string>;
  splitFeePcts: BigNumber[];
  rewardTokens: string[];
};

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
    const { getLogs, createBalances } = options;

    const { markets, marketToUnderlying, splitFeePcts, rewardTokens } = await fetchMarkets(options.api);

    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens,
    });
    const allFeeAccruedEvents = markets.length ? await getLogs({
      targets: markets,
      eventAbi: ABI.feeAccruedEvent,
      flatten: false,
    }): []

    markets.forEach((market, i) => {
      const token = marketToUnderlying.get(market);
      const fees = allFeeAccruedEvents[i];

      fees.forEach(([fee]: bigint[]) => {
        const feeBn = new BigNumber(fee.toString());
        const curatorFeeBn = feeBn.times(splitFeePcts[i]).dividedToIntegerBy(100);

        dailyFees.add(token!, feeBn);
        dailySupplySideRevenue.add(token!, curatorFeeBn.toNumber());
        dailyRevenue.add(token!, feeBn.minus(curatorFeeBn));
      });
    });

    return {
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      timestamp,
    };
  };
};

const methodology = {
  UserFees: "Users pay multiple types of fees: issuance fee, performance fee, redemption fee, and post-settlement fee",
  Fees: "Total of all fees paid by users including issuance, performance, redemption, and post-settlement fees",
  Revenue: "A portion of all fees is collected by the protocol based on the split fee percentage",
  ProtocolRevenue:
    "Protocol revenue is the portion of fees not distributed to curators, determined by the split fee percentage",
  SupplySideRevenue: "Curators receive a percentage of the fees as specified by each pool's splitFeePercentage",
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
        },
      ])
    ),
  },
  methodology,
};

export default adapter;
