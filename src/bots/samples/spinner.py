# Spinner — sits still and sweeps its turret, firing at anything it sees.
from battletanks import Bot


class Spinner(Bot):
    def on_tick(self, state):
        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(state.me.turret_heading + target.bearing)
            if abs(target.bearing) < 4 and state.me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(1.0)
