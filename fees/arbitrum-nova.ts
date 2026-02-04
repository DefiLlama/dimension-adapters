
import { FetchOptions, FetchResultV2, ProtocolType, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';

const eventAbi = 'event RecipientRecieved( address indexed recipient,uint256 value)'
async function getFees(options: FetchOptions) {
  const feeWallet = '0xc9722CfDDFbC6aF4E77023E8B5Bd87489EFEbf5F';
  const l1FeeVault = '0x3B68a689c929327224dBfCe31C1bf72Ffd2559Ce';
  const baseFeeVault = '0x9fCB6F75D99029f28F6F4a1d277bae49c5CAC79f';
  const feeVaults = [
    l1FeeVault,
    baseFeeVault,
    feeWallet
  ];

  const { api, fromApi, createBalances,getLogs } = options;
  const balances = createBalances();
  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  const logs = await getLogs({ targets: feeVaults, eventAbi, })

  logs.map((log) => balances.addGasToken(log.value, 'ETH Gas Fees From Vault Events'))
  balances.addBalances(api.getBalancesV2(), 'Current Fee Vault Balances')
  balances.subtract(fromApi.getBalancesV2(), 'Previous Day Fee Vault Balances')
  return balances
}


const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await getFees(options)

  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM_NOVA]: {
      fetch: fetch,
      start: '2023-08-14',
    }
  },
  protocolType: ProtocolType.CHAIN,
  breakdownMethodology: {
    Fees: {
      'ETH Gas Fees From Vault Events': 'ETH transferred to fee vaults as captured from RecipientRecieved events',
      'Current Fee Vault Balances': 'Current ETH balance held in fee vaults',
      'Previous Day Fee Vault Balances': 'Previous day ETH balance held in fee vaults, subtracted to calculate net daily fees',
    }
  }
}

export default adapter;
