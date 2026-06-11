import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './config'
import { BattleScene } from './scenes/BattleScene'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#2d2d2d',
  physics: {
    default: 'arcade',
  },
  scene: [BattleScene],
})
