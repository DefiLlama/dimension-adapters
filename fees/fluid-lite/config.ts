interface IConfig {
  eventName: string;
  eventAbi: string;
  revenueAbi: string;
  startBlockNumber: number;
  methodology: string;
  stETHAddress: string;
}

export const iETHv2_VAULT = "0xA0D3707c569ff8C87FA923d3823eC5D81c98Be78";

export const CONFIG_FLUID_LITE: IConfig = {
  eventName: "LogCollectRevenue",
  eventAbi: "event LogCollectRevenue(uint256 amount, address indexed to)",
  revenueAbi: "function revenue() view returns (uint256)",
  startBlockNumber: 16609585, // ~ when the lite vault was deployed
  stETHAddress: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  methodology: "Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee. Revenue is collected and transferred to the Instadapp treasury.",
};
