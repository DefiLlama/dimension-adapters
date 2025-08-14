export async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export function formatAddress(address: any): string {
  return String(address).toLowerCase();
}

export function evmAddressToEventTopic(address: string): string {
  if (address[0] === '0' && address[1] === 'x') {
    return `0x000000000000000000000000${formatAddress(address).slice(2)}`
  } else {
    return `0x000000000000000000000000${formatAddress(address)}`
  }
}
