import { CHAIN } from "../../helpers/chains";
import { fraxlendExport } from "../../helpers/fraxlend";

export default {
	...fraxlendExport({
		protocolRevenueRatioFromRevenue: 1,
		registries: {
			[CHAIN.ETHEREUM]: '0xD6E9D27C75Afd88ad24Cd5EdccdC76fd2fc3A751',
			[CHAIN.ARBITRUM]: '0x0bD2fFBcB0A17De2d5a543ec2D47C772eeaD316d',
			[CHAIN.FRAXTAL]: '0x8c22EBc8f9B96cEac97EA21c53F3B27ef2F45e57',
		}
	}),
	start: '2022-02-11',
};
