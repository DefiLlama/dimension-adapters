// https://juice-finance.gitbook.io/juice-finance/juice-protocol/fees#protocol-fees
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const event = "event DepositFeeTaken(uint256 amount)";
const WETH = ADDRESSES.blast.WETH;
const USDB = ADDRESSES.blast.USDB;

const WETH_WETH_stategies: string[] = [
  "0x78E6265a11a41E5Dcd1431448d00f3524943fD11",
  "0x3FeC7f626923445F587C4881a80D00a7104782d1",
  "0x6F3Bc2f9034C151326A80F5ca1Ee0F1eA1E6f002",
  "0xEA42f500A92E4CAa02b2F10E323EadEE1F00fbF7",
  "0x40214EDef589149b9cebb7BE7025197d885D6CB1",
  "0x9Dfd4094b3e88f3b9E79b04514B1669D6779AeC9",
  "0x741011f52B7499ca951f8b8Ee547DD3Cdd813Fda",
  "0x576314F851732b208d807260FE19FeC7Dba3E40C",
  "0x15e44C3f3F9B34fC49cc15A18a597bf80F144bC9",
  "0x98546CdD046219b25B2E617A55563A5e4a3b9Adc",
  "0x3e1B017D21ad613c58F8eE2f78987b3c9F14f643",
  "0xC2eB02621e74E294B73B9fab0A94081393F31978",
];

const WETH_USDB_stategies: string[] = [
  "0xbc0b332d88DCF65a4CD6905eF939213f485FE1A3",
  "0xc1B1aE2502D2cDEF4772FB4A4a6fcBf4fd9c1b80",
  "0x542A672B1DEa78EFd83B9D7D8CAe76cEa59964a1",
  "0x8034b01555487C26D4e21F4E33b7A30fbc90d181",
  "0x4A355D57fc1A5eEB33C0a19539744A2144220027",
  "0x0CA56aa647E83A8F0a5f7a81a2fdcA393bC68D78",
  "0xfEc64ae675CC4B1AacF8F9C0ABeaD585c5496382",
  "0x72E4ce9b7cC5d9C017F64ad58e512C253a11d30a",
];

const USDB_USDB_stategies: string[] = [
  "0xbc0b332d88DCF65a4CD6905eF939213f485FE1A3",
  "0xc1B1aE2502D2cDEF4772FB4A4a6fcBf4fd9c1b80",
  "0xd04c891876675f8c02160ee33466315ac13afc38",
  "0x542A672B1DEa78EFd83B9D7D8CAe76cEa59964a1",
  "0x0CA56aa647E83A8F0a5f7a81a2fdcA393bC68D78",
];

const getAndSumFees = async (
  options: FetchOptions,
  targets: string[],
  event: string
) => {
  const logsFees = await options.getLogs({
    targets,
    eventAbi: event,
    flatten: true,
  });
  return logsFees.reduce((acc, fee) => acc + Number(fee), 0);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  const [wethwethFees, wethusdbFees, usdbusdbFees] = await Promise.all([
    getAndSumFees(options, WETH_WETH_stategies, event),
    getAndSumFees(options, WETH_USDB_stategies, event),
    getAndSumFees(options, USDB_USDB_stategies, event),
  ]);

  dailyFees.add(WETH, wethwethFees);
  dailyFees.add(USDB, wethusdbFees + usdbusdbFees);

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: '2024-03-01',
    },
  },
  version: 2,
  methodology: {
    Fees: "Applied to strategies at the team's discretion and always noted on the vault page. It is charged upon entering the strategy, typically ranging from 0.5% to 2%.",
    Revenue: "Applied to strategies at the team's discretion and always noted on the vault page. It is charged upon entering the strategy, typically ranging from 0.5% to 2%.",
    HoldersRevenue: "No revenue distributed to token holders.",
  },
};

export default adapter;
