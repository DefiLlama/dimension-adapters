import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const timestamp = options.startOfDay * 1000;

  const myHeaders: Record<string, string> = {
    "Accept": "*/*",
    "x-api-key": "N73XLD3QT7WJ5E14MHP41MOH8D6MWSN"
  };

  const transaction_counts = await httpGet("https://emu.mainnet.prod.tzstats.trili.tech/series/block?columns=time,fee,burned_supply&end_date=now&fill=none&collapse=1d&limit=365", { headers: myHeaders })

  const daily_transactions = transaction_counts.find((txs: any) =>
    txs[0] === timestamp
  );
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken('tezos', daily_transactions[1] + daily_transactions[2]);
  dailyRevenue.addCGToken('tezos', daily_transactions[2]);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TEZOS],
  start: '2018-06-30', // Tezos mainnet launch date
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total transaction fees paid by users for gas + storage fees',
    Revenue: 'Amount of tez burned, including storage fees, allocation fees, double baking/attestation punishments, etc.'
  }
};

export default adapter;