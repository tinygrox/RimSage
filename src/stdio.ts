import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { closeDb } from './utils/db'
import { createServer } from './server'

async function main() {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error('\x1b[32m%s\x1b[0m', 'RimSage MCP running...')

  let isShuttingDown = false
  const cleanup = () => {
    if (isShuttingDown) return
    isShuttingDown = true
    console.error('Shutting down...')
    closeDb()
    process.exit(0)
  }

  // Exit when the parent MCP client closes the stdio pipe. This prevents
  // orphaned MCP server processes after the gateway restarts on Windows.
  process.stdin.on('end', cleanup)
  process.stdin.on('close', cleanup)
  process.stdin.resume()

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('disconnect', cleanup)
}

await main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
