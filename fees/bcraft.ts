import { Adapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: FetchV2 = async ({ getLogs, createBalances }) => {
  const dailyFees = createBalances();

  const coinBuyLogs = await getLogs({
    target: "0x7BaEA50509d5d742909592CF045101526b306bE4",
    eventAbi:
      "event MineUpgraded(address indexed user, uint256 newLevel, uint256 cost)",
  });
  coinBuyLogs.map((e: any) => {
    dailyFees.addGasToken(e.cost, "Mine upgrade fees");
  });
  const buySharesLogs = await getLogs({
    target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
    eventAbi:
      "event BuyClanShare(address indexed buyer, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
  });
  buySharesLogs.map((e: any) => {
    dailyFees.addGasToken(e.protocolFee, "Clan share buy fees");
  });

  const sellSharesLogs = await getLogs({
    target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
    eventAbi:
      "event SellClanShare(address indexed seller, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
  });
  sellSharesLogs.map((e: any) => {
    dailyFees.addGasToken(e.protocolFee, "Clan share sell fees");
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.BASE],
  fetch,
  pullHourly: true,
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Mine upgrade fees": "Fees paid by users to upgrade their mine level in the game",
      "Clan share buy fees": "Protocol fees collected when users buy clan shares",
      "Clan share sell fees": "Protocol fees collected when users sell clan shares",
    },
  },
};

export default adapter;
