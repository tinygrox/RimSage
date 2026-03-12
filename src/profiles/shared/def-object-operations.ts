import { file, Glob } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'path'
import { parser } from '../../utils/xml-utils'
import { createBuilderDb } from '../../utils/db'
import { getGameDefsPath, getGameVersionPath } from '../../utils/env'
import {
  resolveDefObjects,
  type DefObject,
} from './def-object-resolver'

async function ensureFileParent(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

function getRimworldPaths(gameId: string) {
  return {
    objectsPath: getGameDefsPath(gameId),
    versionPath: getGameVersionPath(gameId),
  }
}

export async function importDefObjects(rootPath: string, gameId: string) {
  console.log(`Importing object files for '${gameId}'...`)

  const root = resolve(rootPath)
  const version = file(join(root, 'Version.txt'))

  if (!(await version.exists())) {
    throw new Error('"Version.txt" not found, please check the path')
  }

  const versionText = await version.text()
  const { objectsPath, versionPath } = getRimworldPaths(gameId)
  await ensureFileParent(versionPath)
  await Bun.write(versionPath, versionText)

  const glob = new Glob('Data/*/Defs/**/*.xml')

  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const parts = relativePath.split(sep)
    const category = parts[1]
    const objectRelativePath = parts.slice(3).join(sep)
    const output = join(objectsPath, category, objectRelativePath)
    const source = file(join(root, relativePath))

    await ensureFileParent(output)
    await Bun.write(output, source)
  }

  console.log('Done!')
}

export async function indexDefObjects(gameId: string) {
  const { objectsPath } = getRimworldPaths(gameId)
  if (!existsSync(objectsPath)) {
    console.log(`[SKIP] No object directory found for '${gameId}' at ${objectsPath}.`)
    return
  }

  console.log('Starting object build process...')
  console.log('Scanning XML files...')

  const glob = new Glob('**/*.xml')
  const paths: string[] = []

  for await (const path of glob.scan({ cwd: objectsPath })) {
    paths.push(path)
  }

  const xmls = await Promise.all(
    paths.map(async path => file(join(objectsPath, path)).text()),
  )

  console.log(`Parsing ${xmls.length} files...`)
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

  console.log(`Resolving inheritance for ${rawObjects.length} objects...`)
  const resolvedObjects = resolveDefObjects(rawObjects)

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

    const insert = db.prepare(`
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

    const transaction = db.transaction((sourceObjects: DefObject[], mergedObjects: DefObject[]) => {
      sourceObjects.forEach((sourceObject, index) => {
        const resolvedObject = mergedObjects[index]
        if (!resolvedObject?.objectId) return

        insert.run({
          $objectModel: 'def',
          $objectId: resolvedObject.objectId,
          $objectType: resolvedObject.objectType ?? 'Unknown',
          $displayName: resolvedObject.displayName ?? null,
          $payloadFormat: 'xml',
          $rawPayload: JSON.stringify(sourceObject),
          $resolvedPayload: JSON.stringify(resolvedObject),
        })
      })
    })

    transaction(rawObjects, resolvedObjects)
    console.log('Object build complete!')
  } finally {
    db.close()
  }
}
