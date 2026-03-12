import { type GameProfile } from '../games'

export interface GameAdapter {
  profile: GameProfile
  supports: {
    objectImport: boolean
    symbolImport: boolean
    objectIndex: boolean
    symbolIndex: boolean
  }
  commands: {
    importObjects?: (rootPath: string) => Promise<void>
    importSymbols?: (rootPath: string) => Promise<void>
    indexObjects?: () => Promise<void>
    indexSymbols?: () => Promise<void>
    clean?: () => Promise<void>
  }
}
