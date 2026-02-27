import { Adapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: (async ({ getLogs, createBalances }) => {
        const dailyFees = createBalances();
        const dailyRevenue = createBalances();
        const coinBuyLogs = await getLogs({
          target: "0x7BaEA50509d5d742909592CF045101526b306bE4",
          eventAbi:
            "event MineUpgraded(address indexed user, uint256 newLevel, uint256 cost)",
        });
        coinBuyLogs.map((e: any) => {
          dailyFees.addGasToken(e.cost);
          dailyRevenue.addGasToken(e.cost);
        });
        const buySharesLogs = await getLogs({
          target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
          eventAbi:
            "event BuyClanShare(address indexed buyer, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
        });
        buySharesLogs.map((e: any) => {
          dailyFees.addGasToken(e.protocolFee);
          dailyRevenue.addGasToken(e.protocolFee);
        });

        const sellSharesLogs = await getLogs({
          target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
          eventAbi:
            "event SellClanShare(address indexed seller, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
        });
        sellSharesLogs.map((e: any) => {
          dailyFees.addGasToken(e.protocolFee);
          dailyRevenue.addGasToken(e.protocolFee);
        });

        return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
      }) as FetchV2,
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
};

export default adapter;
