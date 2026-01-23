import { ChainApi } from '@defillama/sdk'

type SumTokensExportOptions = {
  owner?: string
  owners?: string[]
  tokens?: string[]
  tokensAndOwners?: [string, string][]
}

export const sumTokensExport = ({ owner, owners, tokens, tokensAndOwners }: SumTokensExportOptions) => {
  const resolvedOwners = owners ?? (owner ? [owner] : [])
  return async (api: ChainApi) => {
    if (tokensAndOwners?.length) {
      await api.sumTokens({ tokensAndOwners })
    } else if (resolvedOwners.length && tokens?.length) {
      await api.sumTokens({ owners: resolvedOwners, tokens })
    }
    return api.getBalances()
  }
}
