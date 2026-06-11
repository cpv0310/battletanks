import Phaser from 'phaser'
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  TANK_REVERSE_FACTOR,
  TANK_ROTATION_SPEED,
  TANK_SPEED,
} from '../config'
import { rotateAngle, velocityFromAngle } from '../core/movement'

export class BattleScene extends Phaser.Scene {
  private tank!: Phaser.GameObjects.Rectangle
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  constructor() {
    super('battle')
  }

  create(): void {
    this.tank = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 40, 28, 0x4caf50)
    this.physics.add.existing(this.tank)
    this.tankBody().setCollideWorldBounds(true)

    if (!this.input.keyboard) {
      throw new Error('Keyboard input is not available in this browser')
    }
    this.cursors = this.input.keyboard.createCursorKeys()
  }

  update(_time: number, deltaMs: number): void {
    const delta = deltaMs / 1000

    if (this.cursors.left.isDown) {
      this.tank.rotation = rotateAngle(this.tank.rotation, TANK_ROTATION_SPEED, delta, -1)
    }
    if (this.cursors.right.isDown) {
      this.tank.rotation = rotateAngle(this.tank.rotation, TANK_ROTATION_SPEED, delta, 1)
    }

    const body = this.tankBody()
    if (this.cursors.up.isDown) {
      const velocity = velocityFromAngle(this.tank.rotation, TANK_SPEED)
      body.setVelocity(velocity.x, velocity.y)
    } else if (this.cursors.down.isDown) {
      const velocity = velocityFromAngle(this.tank.rotation, -TANK_SPEED * TANK_REVERSE_FACTOR)
      body.setVelocity(velocity.x, velocity.y)
    } else {
      body.setVelocity(0, 0)
    }
  }

  private tankBody(): Phaser.Physics.Arcade.Body {
    return this.tank.body as Phaser.Physics.Arcade.Body
  }
}
