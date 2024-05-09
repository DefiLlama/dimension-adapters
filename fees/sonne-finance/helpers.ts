const getVeloGaugeDetails = async (
  gauge: string,
  token: string,
  account: string,
  api: any
) => {
  const lastEarn = await api.call({
    target: gauge,
    abi: "function lastEarn(address token, address account) external view returns (uint256)",
    params: [token, account],
  });
  const earned = await api.call({
    target: gauge,
    abi: "function earned(address token, address account) external view returns (uint256)",
    params: [token, account],
  });

  return {
    lastEarn: lastEarn,
    earned: earned,
  };
};

export {  getVeloGaugeDetails };
