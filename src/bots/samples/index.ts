import hunter from './hunter.py?raw'
import sniper from './sniper.py?raw'
import spinner from './spinner.py?raw'
import teamhunter from './teamhunter.py?raw'
import wanderer from './wanderer.py?raw'

export interface SampleScript {
  readonly name: string
  readonly source: string
}

export const SAMPLE_SCRIPTS: ReadonlyArray<SampleScript> = [
  { name: 'Hunter', source: hunter },
  { name: 'Team Hunter', source: teamhunter },
  { name: 'Spinner', source: spinner },
  { name: 'Wanderer', source: wanderer },
  { name: 'Sniper', source: sniper },
]
