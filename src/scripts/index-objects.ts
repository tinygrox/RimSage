import { runActiveGameCommandIfSupported } from '../profiles'

export async function main() {
  await runActiveGameCommandIfSupported('indexObjects')
}

if (import.meta.main) {
  await main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
