import * as Blockly from 'blockly'
import { TANK_TOOLBOX, defineTankBlocks } from './definitions'
import { registerTankGenerators, workspaceToPython } from './generator'
import { STARTER_BLOCKS_JSON } from './sample'

const DARK_THEME = Blockly.Theme.defineTheme('battletanks-dark', {
  name: 'battletanks-dark',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#14161a',
    toolboxBackgroundColour: '#1f2229',
    toolboxForegroundColour: '#e8eaf0',
    flyoutBackgroundColour: '#262b33',
    flyoutForegroundColour: '#e8eaf0',
    flyoutOpacity: 0.97,
    scrollbarColour: '#3a404d',
    insertionMarkerColour: '#ffffff',
  },
})

/** Drag-and-drop Blockly editor for tank programs. */
export class BlocksEditor {
  private readonly workspace: Blockly.WorkspaceSvg
  private suppressEvents = false

  constructor(container: HTMLElement, onChange: () => void) {
    defineTankBlocks()
    registerTankGenerators()
    this.workspace = Blockly.inject(container, {
      toolbox: TANK_TOOLBOX,
      renderer: 'zelos',
      theme: DARK_THEME,
      zoom: { controls: true, wheel: true, startScale: 0.8 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: false },
    })
    this.workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      if (this.suppressEvents || event.isUiEvent) return
      onChange()
    })
  }

  /** Load a serialized workspace; falls back to the starter program. */
  load(json: string | null): void {
    this.suppressEvents = true
    try {
      const parsed: unknown = JSON.parse(json ?? STARTER_BLOCKS_JSON)
      Blockly.serialization.workspaces.load(parsed as object, this.workspace)
    } catch {
      Blockly.serialization.workspaces.load(
        JSON.parse(STARTER_BLOCKS_JSON) as object,
        this.workspace,
      )
    } finally {
      this.suppressEvents = false
    }
  }

  toJson(): string {
    return JSON.stringify(Blockly.serialization.workspaces.save(this.workspace))
  }

  toPython(): string {
    return workspaceToPython(this.workspace)
  }

  /** Must be called whenever the container becomes visible or resizes. */
  resize(): void {
    Blockly.svgResize(this.workspace)
  }
}
