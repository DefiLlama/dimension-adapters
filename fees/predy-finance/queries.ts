const sdk = require("@defillama/sdk");
const { ControllerAbi, ERC20Abi } = require("./abi");

export const getAsset = async (
  strategy: string,
  pairId: number,
  block = "latest"
) => {
  const data = (
    await sdk.api2.abi.call({
      target: strategy,
      abi: ControllerAbi.find((m: any) => m.name === "getAsset"),
      params: [pairId],
      chain: "arbitrum",
      block: block,
    })
  );

  return data;
};

export const getTotalSupply = async (
  strategyToken: string,
  block = "latest"
) => {
  const data = (
    await sdk.api2.abi.call({
      target: strategyToken,
      abi: ERC20Abi.find((m: any) => m.name === "totalSupply"),
      params: [],
      chain: "arbitrum",
      block: block,
    })
  );

  return data;
};
