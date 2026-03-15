export interface KspConfigNode {
  nodeType: string
  values: Record<string, string | string[]>
  nodes: KspConfigNode[]
}

export function parseKspConfig(text: string): KspConfigNode[] {
  const normalized = normalizeConfig(text)
  const lines = normalized.split(/\r?\n/)
  const root: KspConfigNode = { nodeType: '__root__', values: {}, nodes: [] }
  const stack: KspConfigNode[] = [root]
  let pendingNodeName: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line === '{') {
      if (!pendingNodeName) continue
      const node = createNode(pendingNodeName)
      stack[stack.length - 1].nodes.push(node)
      stack.push(node)
      pendingNodeName = null
      continue
    }

    if (line === '}') {
      if (stack.length > 1) {
        stack.pop()
      }
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex !== -1) {
      const key = line.slice(0, equalsIndex).trim()
      const value = normalizeValue(line.slice(equalsIndex + 1))
      if (key) {
        addValue(stack[stack.length - 1], key, value)
      }
      continue
    }

    pendingNodeName = line
  }

  return root.nodes
}

function normalizeConfig(text: string): string {
  const stripped = stripComments(text)
  return stripped.replace(/[{}]/g, match => `\n${match}\n`)
}

function stripComments(text: string): string {
  let result = ''
  let i = 0
  let inBlock = false

  while (i < text.length) {
    if (inBlock) {
      if (text.startsWith('*/', i)) {
        inBlock = false
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (text.startsWith('/*', i)) {
      inBlock = true
      i += 2
      continue
    }

    if (text.startsWith('//', i)) {
      const nextLine = text.indexOf('\n', i)
      if (nextLine === -1) {
        break
      }
      i = nextLine + 1
      continue
    }

    result += text[i]
    i += 1
  }

  return result
}

function normalizeValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const quote = trimmed[0]
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function createNode(nodeType: string): KspConfigNode {
  return { nodeType: nodeType.trim(), values: {}, nodes: [] }
}

function addValue(node: KspConfigNode, key: string, value: string) {
  const existing = node.values[key]
  if (existing === undefined) {
    node.values[key] = value
    return
  }
  if (Array.isArray(existing)) {
    existing.push(value)
    return
  }
  node.values[key] = [existing, value]
}
