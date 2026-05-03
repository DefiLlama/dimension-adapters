import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://github.com/dinaricrypto/sbt-contracts 
// https://github.com/dinaricrypto/sbt-contracts/blob/50f7cb5f0613c03fad42e7ece78e56d2992d03ba/releases/v0.4.2/order_processor.json#L6
// https://github.com/dinaricrypto/sbt-contracts/blob/50f7cb5f0613c03fad42e7ece78e56d2992d03ba/src/orders/OrderProcessor.sol#L652
const config: Record<string, { processor: string; start: string }> = {
  [CHAIN.ETHEREUM]: { processor: "0xA8a48C202AF4E73ad19513D37158A872A4ac79Cb", start: "2024-01-01" },
  [CHAIN.ARBITRUM]: { processor: "0xFA922457873F750244D93679df0d810881E4131D", start: "2024-01-01" },
  [CHAIN.BASE]: { processor: "0x63FF43009f9ba3584aF2Ddfc3D5FE2cb8AE539c0", start: "2024-01-01" },
  [CHAIN.PLUME]: { processor: "0xFB0C1fF92C4EDCCC00DABFC2ddaC8338E416786e", start: "2024-01-01" },
};

const events = {
  OrderFill: "event OrderFill(uint256 indexed id, address indexed paymentToken, address indexed assetToken, address requester, uint256 assetAmount, uint256 paymentAmount, uint256 feesTaken, bool sell)",
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyFees = createBalances();
  const { processor } = config[options.chain];

  const logs = await getLogs({
    target: processor,
    eventAbi: events.OrderFill,
  });

  logs.forEach((log: any) => {
    dailyFees.add(log.paymentToken, log.feesTaken);
  });

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.entries(config).reduce((acc, [chain, { start }]) => {
    acc[chain] = { fetch, start };
    return acc;
  }, {} as any),
  methodology: {
    Fees: "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).",
    Revenue: "All order fees are sent to the protocol treasury.",
  },
};

export default adapter;
