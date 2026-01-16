import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { METRIC } from "../../helpers/metrics"
import { DefaultVaultsBlacklisted } from "../../helpers/lists"
import { EulerChainConfigs } from './config';

const UINT256_MAX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const eulerFactoryABI = {
  vaultLength: "function getProxyListLength() view returns (uint256)",
  getProxyListSlice: "function getProxyListSlice(uint256 start, uint256 end) view returns (address[] list)",
}

const eulerVaultABI = {
  asset: "function asset() view returns (address)",
  decimals: "function decimals() view returns (uint8)",
  totalAssets: "function totalAssets() view returns (uint256)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  interestFee: 'uint256:interestFee',
  protocolFeeShare: 'uint256:protocolFeeShare',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  // get vaults list from factories
  const vaults = await options.fromApi.call({ target: EulerChainConfigs[options.chain].eVaultAddress, abi: eulerFactoryABI.getProxyListSlice, params: [0, UINT256_MAX] })

  // get vaults info
  const vaultAssets = (await options.fromApi.multiCall({ calls: vaults, abi: eulerVaultABI.asset }))
    .map(asset => asset ? asset : ADDRESSES.null)
  const vaultBalances = await options.fromApi.multiCall({ abi: eulerVaultABI.totalAssets, calls: vaults })
  const vaultInterestFees = await options.fromApi.multiCall({ abi: eulerVaultABI.interestFee, calls: vaults })
  const vaultProtocolFeeShares = await options.fromApi.multiCall({ abi: eulerVaultABI.protocolFeeShare, calls: vaults })

  const convertToAssetsBefore = await options.fromApi.multiCall({
    abi: eulerVaultABI.convertToAssets,
    calls: vaults.map((vaultAddress: string) => ({ target: vaultAddress, params: [String(1e18)] }))
  })
  const convertToAssetsAfter = await options.toApi.multiCall({
    abi: eulerVaultABI.convertToAssets,
    calls: vaults.map((vaultAddress: string) => ({ target: vaultAddress, params: [String(1e18)] }))
  })

  const blacklistedVaults = EulerChainConfigs[options.chain].blacklistedVaults || []

  for (let i = 0; i < vaults.length; i++) {
    if (blacklistedVaults.includes(vaults[i].toLowerCase())) {
      continue
    }
    const balance = vaultBalances[i] ? vaultBalances[i] : 0
    const interestFeeRate = vaultInterestFees[i] ? vaultInterestFees[i] : 0
    const protocolFeeRate = vaultProtocolFeeShares[i] ? vaultProtocolFeeShares[i] : 0

    const growthAssets = Number(convertToAssetsAfter[i]) - Number(convertToAssetsBefore[i])
    
    if (growthAssets > 0) {
      const interestEarned = BigInt(growthAssets) * BigInt(balance) / BigInt(1e18)
  
      let interestEarnedBeforeFees = interestEarned
      if (interestFeeRate < BigInt(1e4)) {
        interestEarnedBeforeFees = interestEarned * BigInt(1e4) / (BigInt(1e4) - BigInt(interestFeeRate))
      }
      
      // performanceFees = Euler fees + curators fees
      const performanceFees = interestEarnedBeforeFees - interestEarned
      const protocolFees = performanceFees * BigInt(protocolFeeRate) / BigInt(1e4)
      const curatorsFees = performanceFees - protocolFees
  
      dailyFees.add(vaultAssets[i], interestEarned, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(vaultAssets[i], interestEarned, METRIC.BORROW_INTEREST);
      
      // add curators fees to supply side revenue
      dailyFees.add(vaultAssets[i], curatorsFees, METRIC.CURATORS_FEES);
      dailySupplySideRevenue.add(vaultAssets[i], curatorsFees, METRIC.CURATORS_FEES);
  
      // fees to Euler protocol is revenue
      dailyFees.add(vaultAssets[i], protocolFees, METRIC.PROTOCOL_FEES)
      dailyRevenue.add(vaultAssets[i], protocolFees, METRIC.PROTOCOL_FEES)
      dailyProtocolRevenue.add(vaultAssets[i], protocolFees, METRIC.PROTOCOL_FEES)
    }
  }

  // buy back EUL
  const dailyHoldersRevenue = options.createBalances()
  if (EulerChainConfigs[options.chain].feeFlowController) {
    const buyEvents = await options.getLogs({
      target: EulerChainConfigs[options.chain].feeFlowController,
      eventAbi: 'event Buy(address indexed buyer, address indexed assetsReceiver, uint256 paymentAmount)',
    })
    for (const buyEvent of buyEvents) {
      dailyHoldersRevenue.add(EulerChainConfigs[options.chain].tokenEUL, buyEvent.paymentAmount, METRIC.TOKEN_BUY_BACK)

      // don't add holder revenue to dailyFees
      // because, fees collected from one day, buy back back happend on days later
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapters: Adapter = {
  version: 2,
  methodology: {
    Fees: "Includes interest that is paid by the borrowers, protocol and curators fees.",
    Revenue: "Fees collected by Euler protocol.",
    ProtocolRevenue: "Fees collected by Euler protocol.",
    SupplySideRevenue: "Fees distributed to vaults lenders and curators.",
    HoldersRevenue: "Revenue used for buy back EUL tokens.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers to lenders (excluding protocol and curators fees).',
      [METRIC.CURATORS_FEES]: 'Interest share to curators.',
      [METRIC.PROTOCOL_FEES]: 'Interest share to Euler protocol.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Interest share to Euler protocol.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers to lenders (excluding protocol and curators fees).',
      [METRIC.CURATORS_FEES]: 'Interest share to curators.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Interest share to Euler protocol.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'Revenue used for buy back EUL tokens.',
    },
  },
  fetch,
  adapter: EulerChainConfigs,
}

export default adapters;