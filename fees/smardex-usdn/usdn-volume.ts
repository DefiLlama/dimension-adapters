import { FetchOptions } from "../../adapters/types";
import { formatEther, ethers } from "ethers";
import { usdnAbi } from "./abis";
import { CONFIG } from "./config";
import { getPrices } from "../../utils/prices";

export class USDNVolumeService {
  private options: FetchOptions;

  constructor(options: FetchOptions) {
    this.options = options;
  }

  private getEventConfigs() {
    const { USDN, DIP_ACCUMULATOR } = CONFIG.CONTRACTS;
    const { USDN: USDN_TOKEN, WSTETH } = CONFIG.TOKENS;

    return [
      {
        abi: usdnAbi.vaultDepositEvent,
        token: USDN_TOKEN,
        valueField: 'amountAfterFees',
        valueIndex: 2,
        contract: USDN,
      },
      {
        abi: usdnAbi.vaultWithdrawalEvent,
        token: USDN_TOKEN,
        valueField: 'amountWithdrawnAfterFees',
        valueIndex: 2,
        contract: USDN,
      },
      {
        abi: usdnAbi.longOpenPositionEvent,
        token: WSTETH,
        valueField: 'amount',
        valueIndex: 4,
        contract: USDN,
      },
      {
        abi: usdnAbi.longClosePositionEvent,
        token: WSTETH,
        valueField: 'amountReceived',
        valueIndex: 3,
        contract: USDN,
      },
      {
        abi: usdnAbi.liquidatedTickEvent,
        token: WSTETH,
        valueField: 'remainingCollateral',
        valueIndex: 4,
        contract: USDN,
      },
      {
        abi: usdnAbi.liquidatorRewarded,
        token: WSTETH,
        valueField: 'rewards',
        valueIndex: 1,
        contract: USDN,
      },
      {
        abi: usdnAbi.rebalancerDepositEvent,
        token: WSTETH,
        valueField: 'amount',
        valueIndex: 1,
        contract: DIP_ACCUMULATOR,
      },
      {
        abi: usdnAbi.rebalancerWithdrawalEvent,
        token: WSTETH,
        valueField: 'amount',
        valueIndex: 2,
        contract: DIP_ACCUMULATOR,
      },
    ];
  }

  public async getUsdnVolume(): Promise<number> {
    let totalVolumeUsd = 0;
    const eventConfigs = this.getEventConfigs();

    for (const config of eventConfigs) {
      const logs = await this.fetchEventLogs(config.abi, config.contract);
      const eventVolume = await this.calculateEventVolumeUsd(logs, config);

      totalVolumeUsd += eventVolume;
    }

    return totalVolumeUsd;
  }

  private async calculateEventVolumeUsd(
    logs: any[],
    config: { abi: any; token: string; valueField: string; valueIndex: number }
  ): Promise<number> {
    if (!logs.length) return 0;

    let eventVolumeUsd = 0;
    const tokenApiKey = `ethereum:${config.token.toLowerCase()}`;
    const batchSize = 10;

    for (let i = 0; i < logs.length; i += batchSize) {
      const batch = logs.slice(i, i + batchSize);

      const volumes = await Promise.all(
        batch.map(async (log) => {
          try {   
            const decodedLog = this.decodeLog(log, config.abi);
            if (!decodedLog) return 0;
            
            const values = Object.values(decodedLog);
            const valueDecoded = values[config.valueIndex] as bigint;
            
            const block = await this.options.api.provider.getBlock(
              log.blockNumber
            );
            if (!block) return 0;

            const priceData = await getPrices([tokenApiKey], block.timestamp);
            const price = this.validateNumber(priceData[tokenApiKey]?.price);

            const valueEther = parseFloat(formatEther(valueDecoded.toString()));
            return valueEther * price;
          } catch (error) {
            console.error("Error processing log:", error);
            return 0;
          }
        })
      );

      eventVolumeUsd += volumes.reduce((sum, val) => sum + val, 0);
    }

    return eventVolumeUsd;
  }

  private async fetchEventLogs(eventAbi: any, target: string) {
    // Try first with eventAbi for automatic decoding
    try {
      const logs = await this.options.getLogs({
        eventAbi,
        target,
        entireLog: true,
      });
      
      // If we get decoded logs with args, return them
      if (logs.length > 0 && logs[0].args) {
        return logs;
      }
    } catch (error) {
      console.log("Failed to get logs with eventAbi, trying with topics:", error);
    }
    
    // Fallback: get logs by topic hash for manual decoding
    const iface = new ethers.Interface([eventAbi]);
    const fragment = iface.fragments[0] as ethers.EventFragment;
    const topicHash = ethers.id(fragment.format('sighash'));
    
    return this.options.getLogs({
      target,
      topics: [topicHash],
      entireLog: true,
    });
  }

  private decodeLog(log: any, eventAbi: any): any {
    try {
      const iface = new ethers.Interface([eventAbi]);
      const decoded = iface.parseLog({
        topics: log.topics,
        data: log.data
      });
      return decoded?.args || null;
    } catch (error) {
      console.error("Error decoding log:", error);
      return null;
    }
  }

  private validateNumber(value: any): number {
    if (value === undefined || value === null) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
}
