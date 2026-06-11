# Juggernaut — spends its loadout on armor, a shield, and a gyro turret:
# a slow 140 HP brawler that wades in, soaks bursts behind its shield,
# and unloads heavy shells at point-blank range.
from battletanks import Bot


class Juggernaut(Bot):
    loadout = ['armor', 'shield', 'gyro']  # 3 + 3 + 2 = 8 points

    def on_start(self, info):
        self.hp = None

    def on_tick(self, state):
        me = state.me
        self.hp = me.hp
        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            target = enemies[0]
            aim = me.turret_heading + target.bearing
            self.turn_turret_to(aim)
            self.turn_to(aim)
            self.drive(1.0 if target.distance > 120 else 0.3)
            # The shield locks the cannon, so only fire once it is down.
            if abs(target.bearing) < 6 and me.cooldown == 0 and not me.shield.active:
                self.fire(3)
            return
        if me.at_wall:
            self.turn_to(me.heading + me.wall_bearing + 180)
        self.drive(0.7)
        self.turn_turret(1.0)

    def on_hit(self, event):
        # Below half health, soak the incoming volley behind the shield.
        if self.hp is not None and self.hp <= 70:
            self.shield()
