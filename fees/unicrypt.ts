import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { queryAllium, getAlliumChain } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const NATIVE_FEES = "Native Locker Fees";
const TOKEN_FEES = "Token Locker Fees";
const feeCollectors = [
  "0xD45dD91DF475bFD944335160f538C1A14888DC1C",
  "0x12a51944e8349B8e70Ed8e2d9BFbc88Adb4A8F4E",
  "0x90Cf3e1FB9D1b35Fad621649ca503Ea13cF37163",
  "0x04bDa42de3bc32Abb00df46004204424d4Cf8287",
].map(i => i.toLowerCase());

const config: Record<string, { start: string; contracts: string[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2022-10-01",
    contracts: [
      "0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214",
      "0xDba68f07d1b7Ca219f78ae8582C213d975c25cAf",
      "0x231278edd38b00b07fbd52120cef685b9baebcc1",
      "0x7f5c649856f900d15c83741f45ae46f5c6858234",
      "0xFD235968e65B0990584585763f837A5b5330e6DE",
      "0x30529ac67D5AC5f33a4e7fE533149a567451F023",
    ],
  },
  [CHAIN.BSC]: {
    start: "2022-10-01",
    contracts: [
      "0xc765bddb93b0d1c1a88282ba0fa6b2d00e3e0c83",
      "0xeaEd594B5926A7D5FBBC61985390BaAf936a6b8d",
      "0x0d29598ec01fa03665feead91d4fb423f393886c",
      "0xf1f7f21e2ea80ab110d0f95faa64655688341990",
      "0xfe88DAB083964C56429baa01F37eC2265AbF1557",
      "0x62d61D5695013a5AA29a628B83d91e240984b613",
      "0x4d19c218cD2DE3261E77e3A4ed80FEca8Cb4cba6",
    ],
  },
  [CHAIN.POLYGON]: {
    start: "2022-10-01",
    contracts: [
      "0xadb2437e6f65682b85f814fbc12fec0508a7b1d0",
      "0x2621816bE08E4279Cf881bc640bE4089BfAf491a",
      "0xc22218406983bf88bb634bb4bf15fa4e0a1a8c84",
      "0xd8207e9449647a9668ad3f8ecb97a1f929f81fd1",
      "0x40f6301edb774e8B22ADC874f6cb17242BaEB8c4",
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2023-03-01",
    contracts: [
      "0x275720567e5955f5f2d53a7a1ab8a0fc643de50e",
      "0x8cb0300Af2A801DC9992225D45399ac56888cBcd",
      "0xfa104eb3925a27e6263e05acc88f2e983a890637",
      "0xcb8b00d4018ad6031e28a44bf74616014bfb62ec",
      "0x6b5360B419e0851b4b81644e0F63c1A9778f2506",
    ],
  },
  [CHAIN.AVAX]: {
    start: "2022-03-10",
    contracts: [
      "0xa9f6aefa5d56db1205f36c34e6482a6d4979b3bb",
      "0xCa61C60D9Da18fA4e836a1e378Ded3205FcEdfA5",
      "0x625e1b2e78DC5b978237f9c29DE2910062D80a05",
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-02-10",
    contracts: [
      "0xc4e637d37113192f4f1f060daebd7758de7f4131",
      "0xA82685520C463A752d5319E6616E4e5fd0215e33",
      "0x231278edd38b00b07fbd52120cef685b9baebcc1",
      "0x610b43e981960b45F818A71CD14C91D35cdA8502",
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: "2024-03-22",
    contracts: [
      "0x599886b24B0A625e4912033213d6b6188a1abCA2",
      "0x1cE6d27F7e5494573684436d99574e8288eBBD2D",
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-05-26",
    contracts: [
      "0x52D6DbD7939e45094C1A3Df563d9D8fc66943b91",
    ],
  },
};

const addNativeRevenue = async (options: FetchOptions, contracts: string, collectors: string, dailyFees: any) => {
  const [{ amount }] = await queryAllium(`
    SELECT COALESCE(SUM(raw_amount), 0) AS amount
    FROM ${getAlliumChain(options.chain)}.assets.native_token_transfers
    WHERE to_address IN ${collectors}
      AND from_address IN ${contracts}
      AND transfer_type = 'value_transfer'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  dailyFees.addGasToken(amount, NATIVE_FEES);
};

const addTokenRevenue = async (options: FetchOptions, contracts: string, collectors: string, dailyFees: any) => {
  const rows = await queryAllium(`
    SELECT token_address AS token, SUM(raw_amount) AS amount
    FROM ${getAlliumChain(options.chain)}.assets.erc20_token_transfers
    WHERE to_address IN ${collectors}
      AND transaction_to_address IN ${contracts}
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY token_address
  `);

  rows.forEach(({ token, amount }: any) => {
    dailyFees.add(token, amount, TOKEN_FEES);
  });
};

const fetch = async (options: FetchOptions) => {
  const contracts = `( ${config[options.chain].contracts.map(i => `'${i.toLowerCase()}'`).join(", ")} )`;
  const collectors = `( ${feeCollectors.map(i => `'${i}'`).join(", ")} )`;
  const dailyFees = options.createBalances();

  await addNativeRevenue(options, contracts, collectors, dailyFees);
  await addTokenRevenue(options, contracts, collectors, dailyFees);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Native and Token fees received by fee collector accounts from official locker and vesting contracts.",
  Revenue: "All tracked fees are retained by UNCX.",
  ProtocolRevenue: "All tracked fees are retained by UNCX.",
};

const breakdownMethodology = {
  Fees: {
    [NATIVE_FEES]: "Native gas-token fees received by current fee collector accounts.",
    [TOKEN_FEES]: "ERC20 Token fees received by current fee collector accounts.",
  },
  Revenue: {
    [NATIVE_FEES]: "Native gas-token fees retained by UNCX.",
    [TOKEN_FEES]: "ERC20 fees retained by UNCX.",
  },
  ProtocolRevenue: {
    [NATIVE_FEES]: "Native gas-token fees retained by UNCX.",
    [TOKEN_FEES]: "ERC20 fees retained by UNCX.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  dependencies: [Dependencies.ALLIUM],
  adapter: config,
  methodology,
  breakdownMethodology,
};

export default adapter;
