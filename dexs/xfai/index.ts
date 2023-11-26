import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { api, util } from "@defillama/sdk";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { BigNumber } from "ethers";
const FACTORY_ADDRESS = "0xa5136eAd459F0E61C99Cec70fe8F5C24cF3ecA26";
const INFT_ADDRESS = "0xa155f12D3Be29BF20b615e1e7F066aE9E3C5239a";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const fetchTotalFees = async (block: number) => {
  const { output: numOfPools } = await api.abi.call({
    chain: "linea",
    abi: "uint256:allPoolsLength",
    target: FACTORY_ADDRESS,
    block,
  });

  let { output: pools } = await api.abi.multiCall({
    abi: "function allPools(uint256) external view returns (address)",
    calls: [...Array(Number(numOfPools)).keys()].map((i) => ({
      params: [i],
      target: FACTORY_ADDRESS,
    })),
    chain: "linea",
    block,
  });
  pools = pools.map(({ output }: { output: string }) => output);

  let { output: tokens } = await api.abi.multiCall({
    abi: "address:poolToken",
    calls: pools.map((p: string) => ({
      params: [],
      target: p,
    })),
    chain: "linea",
    block,
  });
  tokens = tokens.map(({ output }: { output: string }) => output);

  let { output: inftBalances } = await api.abi.multiCall({
    abi: "erc20:balanceOf",
    calls: tokens.map((token: string) => ({
      params: [INFT_ADDRESS],
      target: token,
    })),
    chain: "linea",
    block,
  });

  let { output: harvestedBalance } = await api.abi.multiCall({
    abi: "function harvestedBalance(address) external view returns (uint256)",
    calls: tokens.map((token: string) => ({
      params: [token],
      target: INFT_ADDRESS,
    })),
    chain: "linea",
    block,
  });

  const totalFees: [string, BigNumber][] = inftBalances.map(
    ({ input, output }: { output: string; input: any }, i: number) => [
      `${input.target}`,
      BigNumber.from(output).add(harvestedBalance[i].output).mul(2),
    ]
  );

  return totalFees;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (timestamp, chainBlocks) => {
        const currentBlock = await getBlock(timestamp, "linea", chainBlocks);
        const lastDayBlock = await getBlock(
          timestamp - ONE_DAY_IN_SECONDS,
          "linea",
          {}
        );

        const cumulativeFees = await fetchTotalFees(currentBlock);
        const lastDayCumulativeFees = Object.fromEntries(
          await fetchTotalFees(lastDayBlock)
        );

        const dailyFees = cumulativeFees.map(([token, fees]) => [
          token,
          fees.sub(lastDayCumulativeFees[token] ?? BigNumber.from(0)),
        ]);

        return {
          totalFees: Object.fromEntries(
            cumulativeFees.map(([token, fees]) => [token, fees.toString()])
          ),
          dailyFees: Object.fromEntries(
            dailyFees.map(([token, fees]) => [token, fees.toString()])
          ),
        } as FetchResult;
      },
      meta: {
        methodology: {
          totalFees:
            "Total fees are calculated by checking the token balances of the Xfai INFT",
        },
      },
      start: async () => 1692347965, // Aug-18-2023 08:39:25 AM +UTC
    },
  },
};

export default adapter;
