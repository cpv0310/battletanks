import { sensorRange } from '../config'
import type {
  ObstacleDetection,
  SensorReading,
  SimState,
  TankDetection,
  TankState,
  WallDetection,
} from './types'
import {
  angleBetween,
  clampPointToRect,
  distance,
  rayBoundsDistance,
  relativeAngle,
  segmentIntersectsRect,
} from './geometry'

/** Sensor readings for every tank (dead tanks get an empty reading). */
export function senseAll(state: SimState): SensorReading[] {
  return state.tanks.map((tank) =>
    tank.alive ? sense(state, tank) : { tanks: [], obstacles: [], wall: null },
  )
}

export function sense(state: SimState, sensor: TankState): SensorReading {
  return {
    tanks: detectTanks(state, sensor),
    obstacles: detectObstacles(state, sensor),
    wall: detectWall(state, sensor),
  }
}

function detectTanks(state: SimState, sensor: TankState): TankDetection[] {
  const detections: TankDetection[] = []
  const range = sensorRange(sensor.sensorArc)
  for (const target of state.tanks) {
    if (target.id === sensor.id || !target.alive) continue
    const dist = distance(sensor, target)
    if (dist > range) continue
    const bearing = relativeAngle(sensor.turretHeading, angleBetween(sensor, target))
    if (Math.abs(bearing) > sensor.sensorArc / 2) continue
    if (isBlocked(state, sensor, target)) continue
    detections.push({
      id: target.id,
      distance: dist,
      bearing,
      heading: target.heading,
      speed: target.speed,
    })
  }
  return detections.sort((a, b) => a.distance - b.distance)
}

function isBlocked(state: SimState, from: TankState, to: TankState): boolean {
  return state.arena.obstacles.some((rect) => segmentIntersectsRect(from, to, rect))
}

function detectObstacles(state: SimState, sensor: TankState): ObstacleDetection[] {
  const detections: ObstacleDetection[] = []
  const range = sensorRange(sensor.sensorArc)
  for (const rect of state.arena.obstacles) {
    const nearest = clampPointToRect(sensor, rect)
    const dist = distance(sensor, nearest)
    if (dist > range) continue
    const bearing = relativeAngle(sensor.turretHeading, angleBetween(sensor, nearest))
    if (Math.abs(bearing) > sensor.sensorArc / 2) continue
    detections.push({ distance: dist, bearing, rect })
  }
  return detections.sort((a, b) => a.distance - b.distance)
}

function detectWall(state: SimState, sensor: TankState): WallDetection | null {
  const dist = rayBoundsDistance(sensor, sensor.turretHeading, state.arena.width, state.arena.height)
  if (dist > sensorRange(sensor.sensorArc)) return null
  return { distance: dist, bearing: 0 }
}
