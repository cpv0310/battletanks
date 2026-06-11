# Team Hunter — a fast radar scout that hunts as a pack. It pings the
# radar to find enemies anywhere on the field, shares every contact on
# the team channel, and converges on teammates' reports. Works solo too.
import math

from battletanks import Bot


class TeamHunter(Bot):
    loadout = ['radar', 'engine']  # 3 + 3 = 6 of 8 points

    def on_start(self, info):
        self.goal = None        # (x, y) of the latest known enemy
        self.goal_tick = -1000

    def set_goal(self, state, x, y, share):
        self.goal = (x, y)
        self.goal_tick = state.tick
        if share and state.team is not None:
            self.send_team({'x': x, 'y': y})

    def on_tick(self, state):
        me = state.me

        # Teammates' reports.
        if state.team is not None:
            for msg in state.team.messages:
                self.set_goal(state, msg.data.x, msg.data.y, share=False)

        # Radar contacts (from last tick's ping): chase the nearest enemy.
        if state.ping:
            contacts = [c for c in state.ping if not c.is_teammate]
            if contacts:
                nearest = min(contacts, key=lambda c: c.distance)
                self.set_goal(state, nearest.x, nearest.y, share=True)

        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            target = enemies[0]
            self.set_goal(state, target.x, target.y, share=True)
            aim = me.turret_heading + target.bearing
            self.turn_turret_to(aim)
            self.turn_to(aim)
            self.drive(1.0 if target.distance > 160 else 0.2)
            if abs(target.bearing) < 5 and me.cooldown == 0:
                self.fire(3 if target.distance < 180 else 2)
            return

        if me.at_wall:
            self.turn_to(me.heading + me.wall_bearing + 180)
            self.drive(1.0)
            self.turn_turret(1.0)
            return

        fresh = self.goal is not None and state.tick - self.goal_tick < 360
        if fresh:
            dx = self.goal[0] - me.x
            dy = self.goal[1] - me.y
            if math.hypot(dx, dy) > 80:
                self.turn_to(math.degrees(math.atan2(dy, dx)))
                self.drive(1.0)
                self.turn_turret(0.8)
                return
        elif me.radar.cooldown == 0:
            # Nothing to hunt: light up the radar (everyone will hear it).
            self.ping()

        self.drive(0.6)
        self.turn_turret(1.0)
