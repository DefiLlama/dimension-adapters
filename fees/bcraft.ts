import { Adapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const fetch: FetchV2 = async ({ getLogs, createBalances }) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const coinBuyLogs = await getLogs({
    target: "0x7BaEA50509d5d742909592CF045101526b306bE4",
    eventAbi:
      "event MineUpgraded(address indexed user, uint256 newLevel, uint256 cost)",
  });
  coinBuyLogs.map((e: any) => {
    dailyFees.addGasToken(e.cost, "Mine upgrade fees");
    dailyRevenue.addGasToken(e.cost, "Mine upgrade fees");
  });
  const buySharesLogs = await getLogs({
    target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
    eventAbi:
      "event BuyClanShare(address indexed buyer, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
  });
  buySharesLogs.map((e: any) => {
    dailyFees.addGasToken(e.protocolFee, "Clan share buy fees");
    dailyRevenue.addGasToken(e.protocolFee, "Clan share buy fees");
  });

  const sellSharesLogs = await getLogs({
    target: "0x0De0D0cF717af57D2101F6Be0962fA890c1FBeC6",
    eventAbi:
      "event SellClanShare(address indexed seller, uint256 indexed clanId, uint256 amount, uint256 price, uint256 protocolFee, uint256 subjectFee)",
  });
  sellSharesLogs.map((e: any) => {
    dailyFees.addGasToken(e.protocolFee, "Clan share sell fees");
    dailyRevenue.addGasToken(e.protocolFee, "Clan share sell fees");
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: 0,
    },
  },
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
    Revenue: {
      "Mine upgrade fees": "Fees paid by users to upgrade their mine level in the game, retained by protocol",
      "Clan share buy fees": "Protocol fees collected when users buy clan shares, retained by protocol",
      "Clan share sell fees": "Protocol fees collected when users sell clan shares, retained by protocol",
    },
    ProtocolRevenue: {
      "Mine upgrade fees": "Fees paid by users to upgrade their mine level in the game, retained by protocol",
      "Clan share buy fees": "Protocol fees collected when users buy clan shares, retained by protocol",
      "Clan share sell fees": "Protocol fees collected when users sell clan shares, retained by protocol",
    },
  },
};

export default adapter;
