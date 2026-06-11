# Team Hunter — hunts as a pack. When it spots an enemy it sends the
# enemy's location to its team; when a teammate reports one, it converges
# on that spot. Works solo too (it just hunts alone).
import math

from battletanks import Bot


class TeamHunter(Bot):
    def on_start(self, info):
        self.goal = None        # (x, y) reported by a teammate
        self.goal_tick = -1000

    def on_tick(self, state):
        me = state.me

        # Listen to the team channel for reported enemy positions.
        if state.team is not None:
            for msg in state.team.messages:
                self.goal = (msg.data.x, msg.data.y)
                self.goal_tick = state.tick

        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            target = enemies[0]
            if state.team is not None:
                self.send_team({'x': target.x, 'y': target.y})
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

        # No enemy in sight: converge on the latest team report for a while.
        if self.goal is not None and state.tick - self.goal_tick < 360:
            dx = self.goal[0] - me.x
            dy = self.goal[1] - me.y
            if math.hypot(dx, dy) > 80:
                self.turn_to(math.degrees(math.atan2(dy, dx)))
                self.drive(1.0)
                self.turn_turret(0.8)
                return

        # Patrol: cruise and sweep.
        self.drive(0.6)
        self.turn_turret(1.0)
