type Primitive = string | number | boolean | null | undefined
type XmlNode = Primitive | XmlNode[] | { [key: string]: XmlNode }
type XmlObject = Record<string, XmlNode>

export interface DefObject extends XmlObject {
  objectType?: string
  objectId?: string
  displayName?: string
  '@_Name'?: string
  '@_ParentName'?: string
  '@_Abstract'?: string
  '@_Inherit'?: string
}

export function resolveDefObjects(objects: DefObject[]): DefObject[] {
  const resolver = new DefObjectResolver(objects)
  return objects.map(object => resolver.resolve(object))
}

class DefObjectResolver {
  private readonly objectMap = new Map<string, DefObject>()
  private readonly memo = new Map<string, DefObject>()

  constructor(objects: DefObject[]) {
    objects.forEach(object => {
      if (object['@_Name']) {
        this.objectMap.set(object['@_Name'], object)
      }
    })
  }

  public resolve(object: DefObject): DefObject {
    if (!object['@_ParentName']) return sortObjectKeys(object)

    try {
      const parentResolved = this.resolveByName(object['@_ParentName'], new Set())
      const merged = mergeNodes(stripParentMeta(parentResolved), object) as DefObject
      return sortObjectKeys(merged)
    } catch (error: any) {
      console.warn(
        `[DefObjectResolver] Error resolving ${object.objectId ?? 'unnamed'}: ${error.message}`,
      )
      return object
    }
  }

  private resolveByName(name: string, stack: Set<string>): DefObject {
    if (this.memo.has(name)) return this.memo.get(name)!

    if (stack.has(name)) {
      throw new Error(`Circular inheritance: ${Array.from(stack).join(' -> ')} -> ${name}`)
    }

    const rawObject = this.objectMap.get(name)
    if (!rawObject) {
      throw new Error(`Parent object "${name}" not found.`)
    }

    const parentName = rawObject['@_ParentName']
    let resolvedObject: DefObject

    if (parentName) {
      const parentStack = new Set(stack).add(name)
      const parent = this.resolveByName(parentName, parentStack)
      resolvedObject = mergeNodes(stripParentMeta(parent), rawObject) as DefObject
    } else {
      resolvedObject = rawObject
    }

    this.memo.set(name, resolvedObject)
    return resolvedObject
  }
}

function stripParentMeta(object: DefObject): DefObject {
  const { '@_Name': _n, '@_Abstract': _a, '@_ParentName': _p, ...rest } = object
  return rest
}

function mergeNodes(parent: XmlNode, child: XmlNode): XmlNode {
  if (child === undefined || child === null) return parent
  if (parent === undefined || parent === null) return child

  if (Array.isArray(parent) && Array.isArray(child)) {
    return [...parent, ...child]
  }

  if (isXmlObject(parent) && isXmlObject(child)) {
    const inheritAttr = child['@_Inherit'] as string | undefined
    if (inheritAttr?.toLowerCase() === 'false') return child

    const allKeys = new Set([...Object.keys(parent), ...Object.keys(child)])
    const result: XmlObject = {}

    for (const key of allKeys) {
      result[key] = mergeNodes(parent[key], child[key])
    }

    return result
  }

  return child
}

function sortObjectKeys(object: DefObject): DefObject {
  const priorityKeys = ['objectId', 'displayName', 'description']
  const sorted: DefObject = {}

  const keys = Object.keys(object).sort((left, right) => {
    const leftIndex = priorityKeys.indexOf(left)
    const rightIndex = priorityKeys.indexOf(right)

    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex
    if (leftIndex !== -1) return -1
    if (rightIndex !== -1) return 1

    return left.localeCompare(right)
  })

  keys.forEach(key => (sorted[key] = object[key]))
  return sorted
}

function isXmlObject(item: unknown): item is XmlObject {
  return Boolean(item) && typeof item === 'object' && !Array.isArray(item)
}
