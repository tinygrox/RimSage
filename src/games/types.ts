export interface GameObjectModel {
  id: string
  singularName: string
  pluralName: string
  description: string
  typeFieldName?: string
  idFieldName: string
  displayFieldName?: string
}

export interface GameProfile {
  id: string
  displayName: string
  description: string
  assetRoot: string
  defaultSearchGlobs: string[]
  symbolLanguages: string[]
  sourceFileExtensions?: string[]
  objectModels: GameObjectModel[]
}
