import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { IJSON } from "../adapters/types";

const event_claim_reward =
  "event ClaimRewards(address indexed user,address[] rewardTokens,uint256[] rewardAmounts)";
const event_create_ty =
  "event CreateYieldContract(address indexed SY,uint256 indexed expiry,address PT,address YT)";
const event_collect_interest_fees =
  "event CollectInterestFee(uint256 amountInterestFee)";
const event_collect_reward_fees =
  "event CollectRewardFee(address indexed rewardToken,uint256 amountRewardFee)";
const event_swap =
  "event Swap(address indexed caller,address indexed receiver,int256 netPtOut,int256 netSyOut,uint256 netSyFee,uint256 netSyToReserve)";

const topic0_collect_interest_fees =
  "0x004e8d79e4b41c5fad7561dc7c07786ee4e52292da7a3f5dc7ab90e32cc30423";
const topic0_collect_reward_fees =
  "0x880a48d40a6133941abdcfabd5c5f9a791b1e6c8afd23138c5a36e3d95039222";
const topic0_swap =
  "0x829000a5bc6a12d46e30cdcecd7c56b1efd88f6d7d059da6734a04f3764557c4";

const contract_interface = new ethers.utils.Interface([
  event_claim_reward,
  event_create_ty,
  event_collect_interest_fees,
  event_collect_reward_fees,
  event_swap,
]);

interface Price {
  decimals: number;
  price: number;
  symbol: string;
  timestamp: number;
}
interface LogRes {
  logs: any;
  reward: string[];
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

interface ISY {
  address: string;
}
interface IMarket {
  address: string;
  sy: ISY;
}
interface Addresses {
  SYs: string[];
  YTs: string[];
}
type TChainId = {
  [l: string]: number;
};
const mapChainId: TChainId = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.ARBITRUM]: 42161,
};
interface IReward {
  rewardTokens0: string;
  rewardTokens1: string;
  rewardAmounts0: number;
  rewardAmounts1: number;
}

async function getContracts(chain: Chain, toBlock: any): Promise<Addresses> {
  const factories: { [chain: string]: any } = {
    ethereum: {
      address: "0x27b1dacd74688af24a64bd3c9c1b143118740784",
      deployed: 16032059,
    },
    arbitrum: {
      address: "0xf5a7de2d276dbda3eef1b62a9e718eff4d29ddc8",
      deployed: 62979673,
    },
  };

  const logs = await sdk.api.util.getLogs({
    target: factories[chain].address,
    topic: "",
    toBlock,
    fromBlock: factories[chain].deployed,
    keys: [],
    chain,
    topics: [
      "0x166ae5f55615b65bbd9a2496e98d4e4d78ca15bd6127c0fe2dc27b76f6c03143",
    ],
  }); // yarn test fees pendle

  const markets: string[] = logs.output.map(
    (l: any) => `0x${l.topics[1].substring(26)}`,
  );

  const tokens: string[][] = (
    await sdk.api.abi.multiCall({
      calls: markets.map((target: string) => ({ target })),
      abi: "function readTokens() view returns (address _SY, address _PT, address _YT)",
      chain,
    })
  ).output.map((t: any) => t.output);

  return {
    SYs: [...new Set(tokens.map((t: any) => t._SY.toLowerCase()))],
    YTs: [...new Set(tokens.map((t: any) => t._YT.toLowerCase()))],
  };
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const startblock = await getBlock(fromTimestamp, chain, {});
    const endblock = await getBlock(toTimestamp, chain, {});
    const contract_addresses = await getContracts(chain, startblock);

    const logs: ILog[][] = (
      await Promise.all(
        contract_addresses.SYs.map((address: string) =>
          sdk.api.util.getLogs({
            target: address,
            topic: "",
            toBlock: endblock,
            fromBlock: startblock,
            keys: [],
            chain: chain,
            topics: [
              "0x2193aa20a3717f5f4ac79482f4f553e5f0afe8f4e6ec3e3d1aa2e138adc4763f",
            ],
          }),
        ),
      )
    )
      .map((p: any) => p)
      .map((a: any) => a.output)
      .flat();

    const raws = logs.map((e: any) => {
      const value = contract_interface.parseLog(e);
      return {
        rewardTokens0: value.args.rewardTokens[0] || "",
        rewardTokens1: value.args.rewardTokens[1] || "",
        rewardAmounts0: Number(value.args.rewardAmounts[0]?._hex || 0),
        rewardAmounts1: Number(value.args.rewardAmounts[1]?._hex || 0),
      };
    });

    const fees = await interestFeeLogs(
      contract_addresses,
      startblock,
      endblock,
    );

    const coins = [
      ...new Set(
        [
          ...raws.map((e) => e.rewardTokens0),
          ...raws.map((e) => e.rewardTokens0),
          ...fees.reward,
        ]
          .filter((e: string) => e)
          .map((e: string) => `${chain}:${e.toLowerCase()}`),
      ),
    ];
    const prices = await getPrices(coins, timestamp);

    const fees_interest = aggregate(
      fees.logs,
      chain,
      contract_addresses,
      prices,
      false,
    );
    const rewardAmount = raws
      .map((e: IReward) => {
        const price0 =
          prices[`${chain}:${e.rewardTokens0.toLowerCase()}`]?.price || 0;
        const price1 =
          prices[`${chain}:${e.rewardTokens1.toLowerCase()}`]?.price || 0;
        const decimals0 =
          prices[`${chain}:${e.rewardTokens0.toLowerCase()}`]?.decimals || 0;
        const decimals1 =
          prices[`${chain}:${e.rewardTokens1.toLowerCase()}`]?.decimals || 0;
        const amount0 = (Number(e.rewardAmounts0) / 10 ** decimals0) * price0;
        const amount1 = (Number(e.rewardAmounts1) / 10 ** decimals1) * price1;
        return amount0 + amount1;
      })
      .reduce((a: number, b: number) => a + b, 0);
    const swap_fees = await fetch_swap_fees(
      chain,
      timestamp,
      startblock,
      endblock,
    );

    const dailyFees = rewardAmount + fees_interest;
    const dailyRevenue = rewardAmount * 0.03 + swap_fees;
    return {
      dailyFees: `${dailyFees + swap_fees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp,
    };
  };
};

async function rewardFeeLogs(
  contract_addresses: Addresses,
  fromBlock: any,
  toBlock: any,
): Promise<LogRes> {
  const logs: ILog[] = (
    await Promise.all(
      contract_addresses.YTs.map((address: string) =>
        sdk.api.util.getLogs({
          target: address,
          topic: "",
          toBlock,
          fromBlock,
          keys: [],
          chain: CHAIN.ARBITRUM,
          topics: [topic0_collect_reward_fees],
        }),
      ),
    )
  )
    .map((p: any) => p)
    .map((a: any) => a.output)
    .flat();

  const reward = logs.map(
    (e: ILog) => contract_interface.parseLog(e).args.rewardToken,
  );

  return { logs, reward };
}

async function interestFeeLogs(
  contract_addresses: Addresses,
  fromBlock: any,
  toBlock: any,
): Promise<LogRes> {
  const logs: ILog[] = (
    await Promise.all(
      contract_addresses.YTs.map((address: string) =>
        sdk.api.util.getLogs({
          target: address,
          topic: "",
          toBlock,
          fromBlock,
          keys: [],
          chain: CHAIN.ARBITRUM,
          topics: [topic0_collect_interest_fees],
        }),
      ),
    )
  )
    .map((p: any) => p)
    .map((a: any) => a.output)
    .flat();

  return { logs, reward: [] };
}

function aggregate(
  logs: any[],
  chain: any,
  contract_addresses: Addresses,
  prices: IJSON<Price>,
  isReward: boolean,
) {
  const fees: number = logs
    .map((a: ILog) => {
      const value = contract_interface.parseLog(a);

      try {
        let key: string;
        if (isReward) {
          key = value.args.rewardToken.toLowerCase();
        } else {
          const yt_contract_index = contract_addresses.YTs.findIndex(
            (e: string) => e.toLowerCase() === a.address.toLowerCase(),
          );
          key = contract_addresses.SYs[yt_contract_index].toLowerCase();
        }

        const price = prices[`${chain}:${key}`].price;
        const decimals = prices[`${chain}:${key}`].decimals;
        return (
          (Number(
            value.args[isReward ? "amountRewardFee" : "amountInterestFee"]._hex,
          ) /
            10 ** decimals) *
          price
        );
      } catch {
        // arbi fees
        return 0;
      }
    })
    .reduce((a: number, b: number) => a + b, 0);

  return fees;
}

const fetchARB = async (timestamp: number) => {
  try {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const startblock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {});
    const endblock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {});
    const contract_addresses = await getContracts("arbitrum", startblock);

    const fees = await interestFeeLogs(
      contract_addresses,
      startblock,
      endblock,
    );
    const reward = await rewardFeeLogs(
      contract_addresses,
      startblock,
      endblock,
    );

    const coins = [
      ...new Set([...reward.reward, ...contract_addresses.SYs]),
    ].map((e: string) => `${CHAIN.ARBITRUM}:${e.toLowerCase()}`);
    const prices = await getPrices(coins, timestamp);

    const fees_interest = aggregate(
      fees.logs,
      "arbitrum",
      contract_addresses,
      prices,
      false,
    );
    const fees_reward = aggregate(
      fees.logs,
      "arbitrum",
      contract_addresses,
      prices,
      true,
    );

    const swap_fees = await fetch_swap_fees(
      CHAIN.ARBITRUM,
      timestamp,
      startblock,
      endblock,
    );
    const dailyFees = fees_interest + fees_reward + swap_fees;
    const dailyRevenue = dailyFees;

    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const fetch_swap_fees = async (
  chain: Chain,
  timestamp: number,
  startblock: number,
  endblock: number,
): Promise<number> => {
  const url = "https://api-v2.pendle.finance/core/graphql";
  const graphQueryDaily = gql`{markets(chainId: ${mapChainId[chain]}, limit: 1000) {
    results {
      address
      sy {
        address
      }
    }
  }}`;
  const markets: IMarket[] = (await request(url, graphQueryDaily)).markets
    .results;
  const markets_addess = markets.map((e: IMarket) => e.address);
  const coins = markets.map(
    (e: IMarket) => `${chain}:${e.sy.address.toLowerCase()}`,
  );
  const prices = await getPrices(coins, timestamp);

  const logs_collect_reward_fees: ILog[] = (
    await Promise.all(
      markets_addess.map((address: string) =>
        sdk.api.util.getLogs({
          target: address,
          topic: "",
          toBlock: endblock,
          fromBlock: startblock,
          keys: [],
          chain: chain,
          topics: [topic0_swap],
        }),
      ),
    )
  )
    .map((p: any) => p)
    .map((a: any) => a.output)
    .flat();
  const swap_fees = logs_collect_reward_fees
    .map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const market = markets.find(
        (e) => e.address.toLowerCase() === e.address.toLowerCase(),
      );
      const price =
        prices[`${chain}:${market?.sy.address.toLowerCase()}`].price;
      const decimals =
        prices[`${chain}:${market?.sy.address.toLowerCase()}`].decimals;
      return (Number(value.args.netSyToReserve) / 10 ** decimals) * price;
    })
    .reduce((a: number, b: number) => a + b, 0);
  return swap_fees;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchARB,
      start: async () => 1686268800,
    },
  },
};

export default adapter;
