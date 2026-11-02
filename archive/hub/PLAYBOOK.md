# TuteDude Community Activation Playbook

Goal: students create their own groups and run their own sessions, and the community is active every day with thousands online at the same time, without staff pushing every event.

## 1. The three levers (what the Hub implements)

**Same time, every day.** People show up when there is a fixed appointment. The Hub ships three daily slots that always exist, even before anyone hosts them:
- 9:00 AM IST Morning Standup (15 min)
- 6:00 PM IST Doubt Hour (45 min)
- 9:00 PM IST Build Hour (60 min)
The home page always shows "Next up" with a countdown and an "I'm in" button, so 9 PM becomes a habit, not an event.

**Anyone can host.** Hosting is one form: title, type, track, time, link. It earns 20 points and puts your name on the card. Students volunteer to run "React doubts: bring your bugs" or "Portfolio roast" because it costs nothing and it's visible.

**Showing up is rewarded.** Points (host +20, join live +10, challenge +5, RSVP +2, message +1), a daily streak, and a public leaderboard. Groups compete too ("Top groups"). This gives people a reason to come back tomorrow.

## 2. Launch sequence (first 14 days)

Day 0-2: Seed. Staff host all three slots for two days. Announce one line on SpeakUp and WhatsApp each morning: "9 PM Build Hour tonight, 212 already in". Put the online-now count in every message.

Day 3-7: Hand over. Pick 20 active students (the leaderboard tells you who). Message them personally: "Host Doubt Hour on Thursday?" Give them a 1-page host guide (below). Staff drop to one slot a day.

Day 8-14: Compete. Announce a weekly prize for the top group and top host (a TuteDude swag or course credit is enough). Post the leaderboard screenshot every Sunday.

After that: staff only moderate. Moderators' job is to make sure every daily slot has a host by noon (ping the top 5 of the leaderboard if not).

## 3. Why 3,000 at the same time is possible

- One appointment (9 PM Build Hour) is easier to fill than 50 scattered sessions. Promote one slot hard.
- Build Hour is co-working: a Meet/Zoom/Discord stage with music, cameras optional, a shared "what I'm building tonight" thread. It scales because nobody has to present.
- Doubt Hour runs in parallel rooms per track (dev, design, marketing) with one host each, so 3,000 splits into manageable rooms. Students self-select by clicking the track.
- Use a tool that holds the numbers: Discord stage (unlimited listeners), YouTube Live + chat, or Zoom Webinar. Google Meet caps at 100-500 depending on plan. The Hub's job is the lobby, RSVP, countdown and chat; the call itself runs on one of those.

## 4. Host guide (give this to every student host)

1. Publish the session in the Hub at least 6 hours before. Title says exactly what people get.
2. Post the Hub card link on SpeakUp with one line.
3. Start on time. First 3 minutes: say the plan, ask everyone to drop their name + what they're working on in the room chat.
4. Every 15 minutes: one quick check-in or question in the chat. Pin decisions with "!".
5. End with: "Same time tomorrow. Who's hosting?" and tag someone.
6. After: write one line in #general on what happened. That's how the next person finds it.

## 5. Daily content loop (automated in the Hub)

- Today's challenge: a new prompt each day on the home page, answered in #general for +5 points.
- Icebreaker button in every room.
- Weekly cycle: Mon ideation, Tue-Thu build hours, Fri demo day (sessions of type "Demo"), weekend chai breaks.

## 6. Metrics to watch (weekly)

- Sessions hosted by students vs staff (target: 80% students by week 3)
- RSVPs per daily slot and actual joins (click-through on "Join call")
- Daily active in rooms (messages per day, unique senders)
- Streak distribution: how many students have a 7-day streak
- Groups formed and groups with 3+ members

## 7. What to add when you move off the prototype

The Hub prototype stores data in the claude.ai artifact database (or browser storage for the static files). For thousands of concurrent users move to Firebase/Supabase (same five-method adapter in `community.js`), add login with the TuteDude account (which also enforces "students only" automatically), send push/WhatsApp reminders 30 minutes before each slot, and auto-create next week's daily slots from a cron job.
