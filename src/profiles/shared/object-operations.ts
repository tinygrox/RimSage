import { file, Glob } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'path'
import { getGameProfile } from '../../games'
import { createBuilderDb } from '../../utils/db'
import {
  getGameDefsPath,
  getGameObjectModelPath,
  getGameVersionPath,
} from '../../utils/env'
import {
  getGameBuildConfig,
  getGameObjectBuildConfigs,
  loadBuildConfigSync,
  type NormalizedGameObjectBuildConfig,
} from '../../utils/build-config'
import { type SqlNamedParams } from '../../types'
import { parseKspConfig, type KspConfigNode } from '../../utils/ksp-config'
import { parser } from '../../utils/xml-utils'
import {
  resolveDefObjects,
  type DefObject,
} from './def-object-resolver'

interface IndexedObjectInsert {
  $objectModel: string
  $objectId: string
  $objectType: string
  $displayName: string | null
  $payloadFormat: 'xml' | 'json' | 'text'
  $rawPayload: string
  $resolvedPayload: string
}

type IndexedObjectInsertParams = SqlNamedParams & IndexedObjectInsert

interface KspIndexedNode extends KspConfigNode {
  objectId: string
  displayName?: string
  sourceFile: string
  nodePath: string
}

interface JsonIndexedObject {
  objectId: string
  objectType: string
  displayName?: string
  payload: unknown
}

async function ensureFileParent(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

export async function importConfiguredObjects(gameId: string, rootPath?: string) {
  const objectConfigs = getObjectConfigs(gameId, rootPath)

  if (objectConfigs.length === 0) {
    console.log(`[SKIP] No object import model configured for '${gameId}'.`)
    return
  }

  for (const config of objectConfigs) {
    const sourceRoot = rootPath ?? config.path
    if (!sourceRoot) {
      console.log(
        `[SKIP] Object model '${config.id}' for '${gameId}' has no input path.`,
      )
      continue
    }

    switch (config.kind) {
      case 'kspConfigNode':
        await importKspConfigObjects(gameId, config, sourceRoot)
        break
      case 'jsonFiles':
        await importJsonObjects(gameId, config, sourceRoot)
        break
      case 'rimworldDefXml':
      default:
        await importRimworldDefObjects(gameId, sourceRoot)
        break
    }
  }
}

export async function indexConfiguredObjects(gameId: string) {
  const profile = getGameProfile(gameId)
  const modelConfigs = getObjectConfigs(gameId)

  if (profile.objectModels.length === 0) {
    console.log(`[SKIP] No object models available for '${gameId}'.`)
    return
  }

  const rows: IndexedObjectInsertParams[] = []

  for (const model of profile.objectModels) {
    const config =
      modelConfigs.find(item => item.id === model.id) ??
      ({
        id: model.id,
        kind: model.importKind ?? (model.id === 'ksp_config' ? 'kspConfigNode' : 'rimworldDefXml'),
      } satisfies NormalizedGameObjectBuildConfig)

    switch (config.kind) {
      case 'kspConfigNode':
        rows.push(...(await readKspConfigRows(gameId, config.id)))
        break
      case 'jsonFiles':
        rows.push(...(await readJsonRows(gameId, config)))
        break
      case 'rimworldDefXml':
      default:
        rows.push(...(await readRimworldDefRows(gameId, config.id)))
        break
    }
  }

  if (rows.length === 0) {
    console.log(`[SKIP] No object data found for '${gameId}'.`)
    return
  }

  const db = createBuilderDb(gameId)

  try {
    db.run('DROP TABLE IF EXISTS objects;')
    db.run(`
      CREATE TABLE objects (
        objectModel TEXT,
        objectId TEXT,
        objectType TEXT,
        displayName TEXT,
        payloadFormat TEXT,
        rawPayload JSON,
        resolvedPayload JSON,
        PRIMARY KEY (objectModel, objectId, objectType)
      );
    `)

    const insert = db.prepare<unknown, IndexedObjectInsertParams>(`
      INSERT OR REPLACE INTO objects (
        objectModel,
        objectId,
        objectType,
        displayName,
        payloadFormat,
        rawPayload,
        resolvedPayload
      )
      VALUES (
        $objectModel,
        $objectId,
        $objectType,
        $displayName,
        $payloadFormat,
        $rawPayload,
        $resolvedPayload
      )
    `)

    const transaction = db.transaction((sourceRows: IndexedObjectInsertParams[]) => {
      for (const row of sourceRows) {
        insert.run(row)
      }
    })

    transaction(rows)
    console.log(`Object indexing complete. Wrote ${rows.length} rows.`)
  } finally {
    db.close()
  }
}

function getObjectConfigs(
  gameId: string,
  rootPath?: string,
): NormalizedGameObjectBuildConfig[] {
  const { config } = loadBuildConfigSync()
  const gameConfig = getGameBuildConfig(config, gameId)
  const configured = getGameObjectBuildConfigs(gameConfig, gameId)

  if (configured.length > 0) {
    return configured
  }

  if (rootPath || gameId === 'rimworld' || gameId === 'ksp') {
    return [
      {
        id: gameId === 'ksp' ? 'ksp_config' : 'def',
        model: gameId === 'ksp' ? 'ksp_config' : 'def',
        kind: gameId === 'ksp' ? 'kspConfigNode' : 'rimworldDefXml',
        path: rootPath,
      },
    ]
  }

  return []
}

async function importRimworldDefObjects(gameId: string, rootPath: string) {
  console.log(`Importing RimWorld Def XML for '${gameId}'...`)

  const root = resolve(rootPath)
  const version = file(join(root, 'Version.txt'))

  if (!(await version.exists())) {
    throw new Error('"Version.txt" not found. RimWorld Def import expects a game root.')
  }

  const versionText = await version.text()
  const versionPath = getGameVersionPath(gameId)
  await ensureFileParent(versionPath)
  await Bun.write(versionPath, versionText)

  const glob = new Glob('Data/*/Defs/**/*.xml')
  const objectsPath = getGameDefsPath(gameId)

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const parts = splitPath(relativePath)
    const category = parts[1]
    const objectRelativePath = parts.slice(3).join('/')
    const output = join(objectsPath, category, objectRelativePath)
    const source = file(join(root, relativePath))

    await ensureFileParent(output)
    await Bun.write(output, source)
  }

  console.log('Done!')
}

async function importKspConfigObjects(
  gameId: string,
  config: NormalizedGameObjectBuildConfig,
  rootPath: string,
) {
  console.log(`Importing KSP ConfigNode files for '${gameId}'...`)

  const root = resolve(rootPath)
  const target = getGameObjectModelPath(gameId, config.id)
  const glob = new Glob(config.importGlob ?? '**/*.cfg')

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const source = file(join(root, relativePath))
    const output = join(target, relativePath)

    await ensureFileParent(output)
    await Bun.write(output, source)
  }

  console.log('Done!')
}

async function importJsonObjects(
  gameId: string,
  config: NormalizedGameObjectBuildConfig,
  rootPath: string,
) {
  console.log(`Importing JSON object files for '${gameId}'...`)

  const root = resolve(rootPath)
  const target = getGameObjectModelPath(gameId, config.id)
  const glob = new Glob(config.importGlob ?? '**/*.json')

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const source = file(join(root, relativePath))
    const output = join(target, relativePath)

    await ensureFileParent(output)
    await Bun.write(output, source)
  }

  console.log('Done!')
}

async function readRimworldDefRows(
  gameId: string,
  modelId: string,
): Promise<IndexedObjectInsertParams[]> {
  const objectsPath = getGameDefsPath(gameId)
  if (!existsSync(objectsPath)) {
    return []
  }

  console.log(`Indexing RimWorld Def XML in: ${objectsPath}`)

  const glob = new Glob('**/*.xml')
  const paths: string[] = []

  for await (const path of glob.scan({ cwd: objectsPath })) {
    paths.push(path)
  }

  const xmls = await Promise.all(
    paths.map(async path => file(join(objectsPath, path)).text()),
  )

  const rawObjects = xmls.flatMap(xml => {
    const parsed = parser.parse(xml)
    if (!parsed || !parsed.Defs) return []

    const objectsForFile = parsed.Defs as Record<string, Array<DefObject>>

    return Object.entries(objectsForFile).flatMap(([objectType, objects]) =>
      objects.map(object =>
        Object.assign(
          {
            objectType,
            objectId: object.defName,
            displayName: object.label,
          },
          object,
        ),
      ),
    )
  })

  const resolvedObjects = resolveDefObjects(rawObjects)
  const rows: IndexedObjectInsertParams[] = []

  rawObjects.forEach((sourceObject, index) => {
    const resolvedObject = resolvedObjects[index]
    if (!resolvedObject?.objectId) return

    rows.push({
      $objectModel: modelId,
      $objectId: resolvedObject.objectId,
      $objectType: resolvedObject.objectType ?? 'Unknown',
      $displayName: stringOrNull(resolvedObject.displayName),
      $payloadFormat: 'xml',
      $rawPayload: JSON.stringify(sourceObject),
      $resolvedPayload: JSON.stringify(resolvedObject),
    })
  })

  return rows
}

async function readKspConfigRows(
  gameId: string,
  modelId: string,
): Promise<IndexedObjectInsertParams[]> {
  const objectsPath = getGameObjectModelPath(gameId, modelId)
  if (!existsSync(objectsPath)) {
    return []
  }

  console.log(`Indexing KSP ConfigNode files in: ${objectsPath}`)

  const glob = new Glob('**/*.cfg')
  const rows: IndexedObjectInsertParams[] = []

  for await (const relativePath of glob.scan({ cwd: objectsPath, onlyFiles: true })) {
    const text = await file(join(objectsPath, relativePath)).text()
    const nodes = parseKspConfig(text)

    nodes.forEach((node, index) => {
      const indexed = indexKspNode(node, relativePath, String(index), undefined)
      rows.push(...flattenKspNode(modelId, indexed))
    })
  }

  return rows
}

async function readJsonRows(
  gameId: string,
  config: NormalizedGameObjectBuildConfig,
): Promise<IndexedObjectInsertParams[]> {
  const objectsPath = getGameObjectModelPath(gameId, config.id)
  if (!existsSync(objectsPath)) {
    return []
  }

  console.log(`Indexing JSON object files in: ${objectsPath}`)

  const glob = new Glob(config.importGlob ?? '**/*.json')
  const rows: IndexedObjectInsertParams[] = []

  for await (const relativePath of glob.scan({ cwd: objectsPath, onlyFiles: true })) {
    const text = await file(join(objectsPath, relativePath)).text()
    let parsed: unknown

    try {
      parsed = JSON.parse(text)
    } catch (error) {
      console.warn(`Failed to parse JSON ${relativePath}:`, error)
      continue
    }

    const objects = extractJsonObjects(parsed, config, relativePath)

    objects.forEach(object => {
      rows.push({
        $objectModel: config.id,
        $objectId: object.objectId,
        $objectType: object.objectType,
        $displayName: object.displayName ?? null,
        $payloadFormat: 'json',
        $rawPayload: JSON.stringify(object.payload),
        $resolvedPayload: JSON.stringify(object.payload),
      })
    })
  }

  return rows
}

export function extractJsonObjects(
  value: unknown,
  config: NormalizedGameObjectBuildConfig,
  sourceFile: string,
): JsonIndexedObject[] {
  const fileType = fileBaseName(sourceFile)
  const objects: JsonIndexedObject[] = []

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      objects.push(indexJsonValue(item, config, fileType, `${sourceFile}#${index}`))
    })
    return objects
  }

  if (!isRecord(value)) {
    return [
      indexJsonValue(value, config, fileType, sourceFile),
    ]
  }

  if (hasConfiguredIdentity(value, config)) {
    objects.push(indexJsonValue(value, config, fileType, sourceFile))
  }

  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        objects.push(
          indexJsonValue(item, config, key, `${sourceFile}#${key}[${index}]`),
        )
      })
      continue
    }

    if (!isRecord(child)) {
      continue
    }

    if (hasConfiguredIdentity(child, config)) {
      objects.push(indexJsonValue(child, config, key, key))
      continue
    }

    for (const [nestedKey, nestedChild] of Object.entries(child)) {
      if (Array.isArray(nestedChild)) {
        nestedChild.forEach((item, index) => {
          objects.push(
            indexJsonValue(
              item,
              config,
              key,
              `${sourceFile}#${key}.${nestedKey}[${index}]`,
            ),
          )
        })
        continue
      }

      if (!isRecord(nestedChild) || !hasConfiguredIdentity(nestedChild, config)) {
        continue
      }

      objects.push(indexJsonValue(nestedChild, config, key, nestedKey))
    }
  }

  if (objects.length === 0) {
    objects.push(indexJsonValue(value, config, fileType, sourceFile))
  }

  return dedupeJsonObjects(objects)
}

function indexJsonValue(
  value: unknown,
  config: NormalizedGameObjectBuildConfig,
  typeHint: string,
  fallbackId: string,
): JsonIndexedObject {
  const objectId = isRecord(value)
    ? stringField(value, idFieldNames(config)) ?? fallbackId
    : fallbackId
  const objectType = isRecord(value)
    ? stringField(value, typeFieldNames(config)) ?? typeHint
    : typeHint
  const displayName = isRecord(value)
    ? stringField(value, displayFieldNames(config))
    : scalarToString(value)

  return {
    objectId,
    objectType,
    displayName,
    payload: value,
  }
}

function dedupeJsonObjects(objects: JsonIndexedObject[]): JsonIndexedObject[] {
  const byKey = new Map<string, JsonIndexedObject>()

  for (const object of objects) {
    byKey.set(`${object.objectType}\0${object.objectId}`, object)
  }

  return Array.from(byKey.values())
}

function hasConfiguredIdentity(
  value: Record<string, unknown>,
  config: NormalizedGameObjectBuildConfig,
): boolean {
  return Boolean(
    stringField(value, idFieldNames(config)) ||
      stringField(value, displayFieldNames(config)),
  )
}

function idFieldNames(config: NormalizedGameObjectBuildConfig): string[] {
  return withConfiguredField(config.idFieldName, [
    'id',
    'ID',
    'Id',
    'defName',
    'name',
    'Name',
    'key',
    'Key',
  ])
}

function typeFieldNames(config: NormalizedGameObjectBuildConfig): string[] {
  return withConfiguredField(config.typeFieldName, [
    'type',
    'Type',
    'kind',
    'Kind',
    'category',
    'Category',
  ])
}

function displayFieldNames(config: NormalizedGameObjectBuildConfig): string[] {
  return withConfiguredField(config.displayFieldName, [
    'label',
    'Label',
    'displayName',
    'DisplayName',
    'name',
    'Name',
    'title',
    'Title',
  ])
}

function withConfiguredField(
  configured: string | undefined,
  fallbacks: string[],
): string[] {
  return Array.from(new Set([configured, ...fallbacks].filter(Boolean) as string[]))
}

function stringField(
  object: Record<string, unknown>,
  fieldNames: string[],
): string | undefined {
  for (const fieldName of fieldNames) {
    const value = scalarToString(object[fieldName])
    if (value) {
      return value
    }
  }

  return undefined
}

function scalarToString(value: unknown): string | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    const text = String(value).trim()
    return text || undefined
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fileBaseName(path: string): string {
  return basename(path, extname(path)) || 'json'
}

function flattenKspNode(
  modelId: string,
  node: KspIndexedNode,
): IndexedObjectInsertParams[] {
  const row: IndexedObjectInsertParams = {
    $objectModel: modelId,
    $objectId: node.objectId,
    $objectType: node.nodeType,
    $displayName: node.displayName ?? null,
    $payloadFormat: 'json',
    $rawPayload: JSON.stringify(node),
    $resolvedPayload: JSON.stringify(node),
  }

  return [
    row,
    ...node.nodes.flatMap(child =>
      flattenKspNode(modelId, child as KspIndexedNode),
    ),
  ]
}

function indexKspNode(
  node: KspConfigNode,
  sourceFile: string,
  nodePath: string,
  parentId: string | undefined,
): KspIndexedNode {
  const name = firstValue(node.values.name ?? node.values.Name)
  const title = firstValue(node.values.title ?? node.values.Title)
  const idPart = name ?? `${node.nodeType}:${nodePath}`
  const objectId = parentId ? `${parentId}/${node.nodeType}:${idPart}` : idPart
  const nextPathPrefix = `${nodePath}/${node.nodeType}:${idPart}`

  return {
    ...node,
    objectId,
    displayName: title ?? name,
    sourceFile,
    nodePath,
    nodes: node.nodes.map((child, index) =>
      indexKspNode(child, sourceFile, `${nextPathPrefix}/${index}`, objectId),
    ),
  }
}

function splitPath(path: string): string[] {
  return path.split(/[\\/]+/)
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
