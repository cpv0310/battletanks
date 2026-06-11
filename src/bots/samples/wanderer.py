# Wanderer — drives around randomly and fires opportunistically.
# Shows how to use self.rng for reproducible randomness and
# state.me.at_wall / state.me.stuck to avoid grinding into walls.
from battletanks import Bot


class Wanderer(Bot):
    def on_start(self, info):
        self.next_change = 0

    def on_tick(self, state):
        me = state.me
        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(me.turret_heading + target.bearing)
            if abs(target.bearing) < 6 and me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(0.8)

        if me.at_wall:
            # Touching the arena wall: head away from it (with some spread).
            away = me.heading + me.wall_bearing + 180
            self.turn_to(away + self.rng.uniform(-40, 40))
            self.drive(1.0)
            self.next_change = state.tick + 45
        elif me.stuck:
            # Blocked by an obstacle or tank: back off and re-roll soon.
            self.drive(-0.8)
            self.turn(1.0)
            self.next_change = state.tick + 20
        elif state.tick >= self.next_change:
            self.next_change = state.tick + self.rng.randint(30, 120)
            self.drive(self.rng.uniform(0.4, 1.0))
            self.turn(self.rng.uniform(-1.0, 1.0))
