import type { MapKind } from '../core/arena'
import type { MatchResult } from '../core/match'
import type { SimState } from '../core/types'

export interface PlayerConfig {
  readonly name: string
  readonly script: string
}

export interface BotStatus {
  readonly inert: boolean
  readonly crashed: boolean
  readonly overruns: number
}

export interface LogEntry {
  readonly botId: number | null
  readonly text: string
  readonly kind: 'out' | 'err' | 'info'
}

export interface Snapshot {
  readonly sim: SimState
  readonly botStatus: ReadonlyArray<BotStatus>
  readonly result: MatchResult | null
}

export type WorkerRequest =
  | { readonly type: 'init'; readonly players: ReadonlyArray<PlayerConfig>; readonly seed: number; readonly map: MapKind }
  | { readonly type: 'advance'; readonly ticks: number }

export type WorkerResponse =
  | { readonly type: 'progress'; readonly message: string }
  | { readonly type: 'initialized'; readonly snapshot: Snapshot; readonly logs: ReadonlyArray<LogEntry> }
  | { readonly type: 'snapshot'; readonly snapshot: Snapshot; readonly logs: ReadonlyArray<LogEntry> }
  | { readonly type: 'fatal'; readonly message: string }
