import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Forkast's CTF Exchange on Arbitrum One, deployed at block 394355236 (2025-10-28 17:26:10 UTC)
// https://arbiscan.io/tx/0x724c7084a1d08176b289213cb44fbbd49648e1effbf5ca4babd35ab0f9e30871
const CTF_EXCHANGE = "0x2D7aa09fe8a9Af205aD6E0Fef1441834c4250cdc";

// PC (Platform Credits), Forkast's settlement token
// https://arbiscan.io/address/0x4AC7b973fb4f10D94eda5Efa92fFABD6aDDFb65c
const PC_TOKEN = "0x4AC7b973fb4f10D94eda5Efa92fFABD6aDDFb65c";

// Forkast backend operator wallets that submit matchOrders()/fillOrder() to the exchange
const OPERATOR_WALLETS = [
  "0x8962cDe7aC43dE7d55e8B61C80EE8d148fC7a201",
  "0x77DdC6E36f17f519284b86657EE37c3E032098a7",
  "0x1b7c08E3aa3A8f0F9f76Cc2503332F2A075C77d2",
  "0x10183Ebd7DBE5E7BcAb16fb617FF7146562C1aA5",
  "0x897A554Da24d3d98Dc4d203E461091EC6245684a",
  "0xA1Ccfba507088c9F824dE98D8C6f5f5b6F5DE123",
  "0x3c482911BD90795F76880011e214a99c7ef74116",
  "0xeF4A1e60dE058BAF91E400d5c1FC907d224B238F",
  "0x1D1347b99741Ae51C1a25030d25Fe7e2E267f0d9",
  "0xb50F07161b1Ef94733aECcaEA661996535060Bc5",
];

const fetch = async (options: FetchOptions) => {
  const query = `
    select coalesce(sum(amount), 0) as daily_volume
    from tokens.transfers
    where
      blockchain = 'arbitrum'
      and contract_address = ${PC_TOKEN}
      and tx_from in (${OPERATOR_WALLETS.join(", ")})
      and tx_to = ${CTF_EXCHANGE}
      and "to" = ${CTF_EXCHANGE}
      and TIME_RANGE
  `;

  const res = await queryDuneSql(options, query);

  if (!res?.[0] || res[0].daily_volume === null || res[0].daily_volume === undefined) {
    throw new Error("Forkast: Dune query returned no data");
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(res[0].daily_volume));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-10-28",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Sum of PC (Platform Credits), Forkast's internal settlement token, moved through trades on our CTFExchange contract. PC is valued at a 1:1 ratio with USDC for this figure.",
  },
};

export default adapter;
