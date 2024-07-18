import ADDRESSES from '../helpers/coreAssets.json';
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SZWETH_CONTRACT = '0x974583f05de1fd18c59c77c4a8803cf0c7db5333';
const SZAUSDC_CONTRACT = '0x38978038a06a21602a4202dfa66968e7f525bf3e';
const AUSDC_CONTRACT = '0x4e65fe4dba92790696d040ac24aa414708f5c0ab';
const SIZE_PROXY_CONTRACT = '0xC2a429681CAd7C1ce36442fbf7A4a68B11eFF940';

const fetch: any = async ({ createBalances, getLogs, api, getFromBlock, getToBlock }: FetchOptions) => {
  const fees = createBalances()
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const FEE_MAPPING = [
    ADDRESSES.base.WETH,
    AUSDC_CONTRACT
  ]
  const logsArray = await Promise.all([
    getLogs({
      target: SZWETH_CONTRACT,
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      fromBlock,
      toBlock
    }),
    getLogs({
      target: SZAUSDC_CONTRACT,
      eventAbi: "event TransferUnscaled(address indexed from, address indexed to, uint256 value)",
      fromBlock,
      toBlock
    })
  ])
  const feeConfig = await api.call({
    target: SIZE_PROXY_CONTRACT,
    abi: "function feeConfig() view returns (uint256 swapFeeAPR, uint256 fragmentationFee, uint256 liquidationRewardPercent, uint256 overdueCollateralProtocolPercent, uint256 collateralProtocolPercent, address feeRecipient)",
    params: [],
  });
  const feeRecipient = feeConfig.feeRecipient;
  logsArray.forEach((logs, i) => {
    logs.forEach((log) => {
      if (log.to === feeRecipient) {
        fees.add(FEE_MAPPING[i], Number(log.value));
      }
    })
  })

  return {
    dailyFees: fees,
    dailyProtocolRevenue: fees
  };
};

const methodology = "Swap fees are applied on every cash-for-credit trade, and fragmentation fees are charged on every credit split"

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: 1721083903,
      meta: {
        methodology: {
          Fees: methodology,
          ProtocolRevenue: methodology
        }
      }
    },
  }
}
export default adapter;