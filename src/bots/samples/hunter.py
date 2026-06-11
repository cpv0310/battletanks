# Hunter — chases the nearest enemy it can see and shoots when lined up.
# If it loses sight, it pursues the last known heading for a while.
from battletanks import Bot


class Hunter(Bot):
    def on_start(self, info):
        self.last_seen_heading = None
        self.last_seen_tick = -1000

    def on_tick(self, state):
        me = state.me
        if state.sensor.tanks:
            target = state.sensor.tanks[0]  # sorted nearest-first
            aim = me.turret_heading + target.bearing
            self.last_seen_heading = aim
            self.last_seen_tick = state.tick

            self.turn_turret_to(aim)
            self.turn_to(aim)
            self.drive(1.0 if target.distance > 150 else 0.2)
            if abs(target.bearing) < 5 and me.cooldown == 0:
                self.fire()
        elif state.tick - self.last_seen_tick < 90:
            # Lost sight recently: keep pushing toward the last known spot.
            self.turn_to(self.last_seen_heading)
            self.drive(1.0)
            self.turn_turret(0.6)
        else:
            # Patrol: cruise and sweep.
            self.drive(0.6)
            self.turn_turret(1.0)

    def on_hit(self, event):
        # Getting shot from outside our arc: swing the turret toward the shot.
        self.turn_turret(1.0 if event.bearing > 0 else -1.0)

    def on_collision(self, event):
        self.turn(1.0)
