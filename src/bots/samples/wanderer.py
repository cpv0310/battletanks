# Wanderer — drives around randomly and fires opportunistically.
# Shows how to use self.rng for reproducible randomness.
from battletanks import Bot


class Wanderer(Bot):
    def on_start(self, info):
        self.next_change = 0

    def on_tick(self, state):
        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(state.me.turret_heading + target.bearing)
            if abs(target.bearing) < 6 and state.me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(0.8)

        if state.tick >= self.next_change:
            self.next_change = state.tick + self.rng.randint(30, 120)
            self.drive(self.rng.uniform(0.4, 1.0))
            self.turn(self.rng.uniform(-1.0, 1.0))

    def on_collision(self, event):
        # Back off and pick a new direction soon.
        self.drive(-0.8)
        self.turn(1.0)
        self.next_change = 0
