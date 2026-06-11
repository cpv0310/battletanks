import Phaser from 'phaser'
import {
  SENSOR_ARC,
  SENSOR_RANGE,
  SHELL_RADIUS,
  TANK_COLORS,
  TANK_HEIGHT,
  TANK_HP,
  TANK_WIDTH,
} from '../config'
import type { Snapshot } from '../bots/protocol'
import { senseAll } from '../core/sensor'
import type { SensorReading, TankState } from '../core/types'

const COLOR_BACKGROUND = 0x20242b
const COLOR_OBSTACLE = 0x4a5160
const COLOR_OBSTACLE_EDGE = 0x666f80
const COLOR_SHELL = 0xffe082
const TURRET_LENGTH = 30

/** Pure view of simulation snapshots — no game rules live here. */
export class BattleScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics
  private labels: Phaser.GameObjects.Text[] = []
  private snapshot: Snapshot | null = null
  private showSensors = true

  /** Called once per rendered frame; the app uses it to pace the simulation. */
  onFrame: (() => void) | null = null

  constructor() {
    super('battle')
  }

  create(): void {
    this.graphics = this.add.graphics()
  }

  resetMatch(players: ReadonlyArray<{ name: string; team?: number | null }>): void {
    this.snapshot = null
    for (const label of this.labels) label.destroy()
    this.labels = players.map((player) => {
      const team = player.team ?? null
      const text = team === null ? player.name : `[T${team}] ${player.name}`
      return this.add
        .text(0, 0, text, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e8eaf0',
        })
        .setOrigin(0.5, 1)
    })
  }

  setSnapshot(snapshot: Snapshot): void {
    this.snapshot = snapshot
  }

  setSensorVisibility(visible: boolean): void {
    this.showSensors = visible
  }

  update(): void {
    this.onFrame?.()
    this.draw()
  }

  private draw(): void {
    const g = this.graphics
    if (!g) return
    g.clear()
    if (!this.snapshot) return
    const { sim } = this.snapshot

    g.fillStyle(COLOR_BACKGROUND, 1)
    g.fillRect(0, 0, sim.arena.width, sim.arena.height)

    for (const rect of sim.arena.obstacles) {
      g.fillStyle(COLOR_OBSTACLE, 1)
      g.fillRect(rect.x, rect.y, rect.width, rect.height)
      g.lineStyle(2, COLOR_OBSTACLE_EDGE, 1)
      g.strokeRect(rect.x, rect.y, rect.width, rect.height)
    }

    // Recompute detections from the same pure sensor model the bots use.
    const readings = this.showSensors ? senseAll(sim) : null

    for (const tank of sim.tanks) {
      if (!tank.alive) continue
      if (readings) this.drawSensorZone(tank)
    }
    for (const tank of sim.tanks) {
      const label = this.labels[tank.id]
      if (!tank.alive) {
        label?.setVisible(false)
        continue
      }
      if (readings) this.drawDetections(tank, readings[tank.id])
      this.drawTank(tank)
      if (label) {
        label.setVisible(true)
        label.setPosition(tank.x, tank.y - 34)
      }
    }

    g.fillStyle(COLOR_SHELL, 1)
    for (const shell of sim.shells) {
      g.fillCircle(shell.x, shell.y, SHELL_RADIUS)
    }
  }

  private drawTank(tank: TankState): void {
    const g = this.graphics
    const color = TANK_COLORS[tank.id] ?? 0xffffff

    const corners = hullCorners(tank)
    g.fillStyle(color, 1)
    g.lineStyle(2, 0x14161a, 0.8)
    g.beginPath()
    g.moveTo(corners[0].x, corners[0].y)
    for (const corner of corners.slice(1)) g.lineTo(corner.x, corner.y)
    g.closePath()
    g.fillPath()
    g.strokePath()

    // Turret: barrel along the turret heading plus a round base.
    g.lineStyle(5, 0x14161a, 1)
    g.lineBetween(
      tank.x,
      tank.y,
      tank.x + Math.cos(tank.turretHeading) * TURRET_LENGTH,
      tank.y + Math.sin(tank.turretHeading) * TURRET_LENGTH,
    )
    g.fillStyle(0x14161a, 1)
    g.fillCircle(tank.x, tank.y, 8)
    g.fillStyle(color, 1)
    g.fillCircle(tank.x, tank.y, 4)

    // HP bar above the hull.
    const ratio = tank.hp / TANK_HP
    g.fillStyle(0x14161a, 0.8)
    g.fillRect(tank.x - 21, tank.y - 31, 42, 6)
    g.fillStyle(ratio > 0.4 ? 0x66bb6a : 0xef5350, 1)
    g.fillRect(tank.x - 20, tank.y - 30, 40 * ratio, 4)
  }

  /** Translucent 90° wedge showing where this tank's sensor can see. */
  private drawSensorZone(tank: TankState): void {
    const g = this.graphics
    const color = TANK_COLORS[tank.id] ?? 0xffffff
    const start = tank.turretHeading - SENSOR_ARC / 2
    const end = tank.turretHeading + SENSOR_ARC / 2
    g.fillStyle(color, 0.07)
    g.slice(tank.x, tank.y, SENSOR_RANGE, start, end, false)
    g.fillPath()
    g.lineStyle(1.5, color, 0.35)
    g.slice(tank.x, tank.y, SENSOR_RANGE, start, end, false)
    g.strokePath()
  }

  /** Highlight everything this tank's sensor currently detects. */
  private drawDetections(tank: TankState, reading: SensorReading): void {
    const g = this.graphics
    const color = TANK_COLORS[tank.id] ?? 0xffffff
    // Stagger highlight sizes per sensing tank so overlapping markers from
    // several sensors stay distinguishable.
    const pad = (tank.id % 4) * 3

    for (const detection of reading.tanks) {
      const target = this.snapshot?.sim.tanks[detection.id]
      if (!target) continue
      g.lineStyle(1.5, color, 0.55)
      g.lineBetween(tank.x, tank.y, target.x, target.y)
      g.lineStyle(2.5, color, 0.95)
      g.strokeCircle(target.x, target.y, 26 + pad)
    }

    for (const detection of reading.obstacles) {
      const { rect } = detection
      g.lineStyle(2, color, 0.8)
      g.strokeRect(rect.x - 2 - pad, rect.y - 2 - pad, rect.width + 4 + pad * 2, rect.height + 4 + pad * 2)
    }

    if (reading.wall) {
      const wx = tank.x + Math.cos(tank.turretHeading) * reading.wall.distance
      const wy = tank.y + Math.sin(tank.turretHeading) * reading.wall.distance
      g.lineStyle(1.5, color, 0.4)
      g.lineBetween(tank.x, tank.y, wx, wy)
      g.fillStyle(color, 0.95)
      g.fillCircle(wx, wy, 5)
    }
  }
}

function hullCorners(tank: TankState): { x: number; y: number }[] {
  const cos = Math.cos(tank.heading)
  const sin = Math.sin(tank.heading)
  const hw = TANK_WIDTH / 2
  const hh = TANK_HEIGHT / 2
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((corner) => ({
    x: tank.x + corner.x * cos - corner.y * sin,
    y: tank.y + corner.x * sin + corner.y * cos,
  }))
}
