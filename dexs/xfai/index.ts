import { CHAIN } from "../../helpers/chains";
import { api } from "@defillama/sdk";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { BigNumber } from "bignumber.js";

const FACTORY_ADDRESS = "0xa5136eAd459F0E61C99Cec70fe8F5C24cF3ecA26";
const INFT_ADDRESS = "0xa155f12D3Be29BF20b615e1e7F066aE9E3C5239a";
const LINEA_WETH_ADDRESS = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const FEE_VOLUME_MULTIPLIER = 1000 / 2;

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
  tokens.push(LINEA_WETH_ADDRESS);

  let { output: tokensDecimals } = await api.abi.multiCall({
    abi: "function decimals() public view returns (uint8)",
    calls: tokens.map((t: string) => ({
      params: [],
      target: t,
    })),
    chain: "linea",
    block,
  });

  let tDecimals: Record<string, number> = Object.fromEntries(
    tokensDecimals.map(
      ({
        input,
        output: decimals,
      }: {
        input: { target: string };
        output: string;
      }) => [input.target, Number(decimals)]
    )
  );

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

  const totalFees: [string, BigNumber, number][] = inftBalances.map(
    ({ input, output }: { output: string; input: any }, i: number) => [
      `${CHAIN.LINEA}:${input.target}`,
      new BigNumber(output).plus(harvestedBalance[i]).times(2),
      tDecimals[input.target],
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

        const dailyFees: [string, BigNumber, number][] = cumulativeFees.map(
          ([token, fees, decimals]) => [
            token,
            fees.minus(lastDayCumulativeFees[token] ?? new BigNumber(0)),
            decimals,
          ]
        );

        return {
          totalFees: Object.fromEntries(
            cumulativeFees.map(([token, fees, decimals]) => [
              token,
                fees
                  .div(new BigNumber(10).pow(decimals))
                  .toString(),
            ])
          ),
          dailyFees: Object.fromEntries(
            dailyFees.map(([token, fees, decimals]) => [
              token,
                fees
                  .div(new BigNumber(10).pow(decimals))
                  .toString(),
            ])
          ),
          totalVolume: Object.fromEntries(
            cumulativeFees.map(([token, fees, decimals]) => [
              token,
                fees
                  .times(FEE_VOLUME_MULTIPLIER)
                  .div(new BigNumber(10).pow(decimals))
                  .toString(),
            ])
          ),
          dailyVolume: Object.fromEntries(
            dailyFees.map(([token, fees, decimals]) => [
              token,
                fees
                  .times(FEE_VOLUME_MULTIPLIER)
                  .div(new BigNumber(10).pow(decimals))
                  .toString(),
            ])
          ),
        } as unknown as FetchResult;
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
