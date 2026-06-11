# Sniper — backs into the nearest corner, narrows its sensor for extra
# range, then sweeps and snipes with heavy shells.
import math

from battletanks import Bot


class Sniper(Bot):
    def on_start(self, info):
        self.arena_width = info.arena.width
        self.arena_height = info.arena.height
        self.corner = None

    def on_tick(self, state):
        me = state.me
        self.set_sensor(45)  # narrow beam: ~590 px of vision
        if self.corner is None:
            cx = 70 if me.x < self.arena_width / 2 else self.arena_width - 70
            cy = 70 if me.y < self.arena_height / 2 else self.arena_height - 70
            self.corner = (cx, cy)

        dx = self.corner[0] - me.x
        dy = self.corner[1] - me.y
        if math.hypot(dx, dy) > 40:
            self.turn_to(math.degrees(math.atan2(dy, dx)))
            self.drive(1.0)
        else:
            self.drive(0.0)

        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(me.turret_heading + target.bearing)
            if abs(target.bearing) < 3 and me.cooldown == 0:
                # Far targets dodge heavy shells, so scale power by distance.
                self.fire(3 if target.distance < 250 else 1)
        else:
            self.turn_turret(0.7)
