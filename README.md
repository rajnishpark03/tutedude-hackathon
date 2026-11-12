# TuteDude Buildathon: website + Team Board

- **Site:** https://rajnishpark03.github.io/tutedude-hackathon/. GitHub Pages serves the `main` branch root.
- **Backend:** Supabase project `zbcldrkowkpvkxepltrt` (Mumbai).

## How it works for students
1. **Register (30 sec).**
   - Required: name, WhatsApp number, email, skill (UI/UX Designer, Developer, Marketing, Video Editor, Other).
   - Optional: a one-line bio and a work link.
   - They confirm they are a TuteDude student. One WhatsApp number or email can register only once.
2. **Pick a team.** After choosing a skill, the student sees **only the names** of teams that still need that skill and picks one.
   - If no team needs that skill, they start a new team, become its leader and can rename it.
   - If the team they picked fills up while they fill the form, they are placed in the next team that needs them and told so.
3. **TuteDude Sessions first (forced).** After registering, a student sees **only their own team**, and teammates' WhatsApp numbers are **locked**.
   - A pop-up opens with the 1-minute TuteDude Sessions video, which starts playing by itself.
   - The video must play **to the end**. Skipping ahead jumps back. The consent box stays disabled until then.
   - Then they tick *"Yes, I'll create or join my team's TuteDude session and do our product discussion there"* and tap **I agree**.
   - Only then do they see their teammates' WhatsApp numbers. The database enforces this, so the numbers aren't even sent to the browser before.
   - Consent is per person. Each teammate has to agree for themselves.
   - The team page also lists the 5 steps to create a room (Community → Sessions → room named "*Team* · Buildathon", audience Everyone).
4. **Connect on WhatsApp.** WhatsApp button for each teammate. The leader can "Copy all numbers" to make a group.
5. **Team complete.** A team completes automatically at 4 people (one per skill), or the leader completes it at 2–3.
6. **Problem statement.** At **21 Nov, 7 PM** it appears on the team page for everyone in a team of 2+ who agreed (see "Publish the problem statement" below).
7. **Lost the team page?** On a new phone or after clearing the browser, "Already registered on another phone or browser?" at the bottom of the form brings the team back with the same WhatsApp number and email.
8. **Dates.** Teams lock **20 Nov, 11:59 PM IST**. The problem statement drops **21 Nov, 7 PM IST**. The page shows live countdowns (flip-calendar style) and which skills are "needed right now".

### Rules the database enforces
- 4 people max, one person per skill, one team per person.
- **No switching teams** after joining.
- The leader can remove a teammate who never responds; that person is placed in another team. Limits: at most 2 removals per team, and only after the teammate has had 6 hours to reply.
- Team names can't impersonate TuteDude or organisers (e.g. "TuteDude Official") and can't contain abuse.
- WhatsApp numbers are visible only to teammates **who agreed to TuteDude Sessions**, and to organisers. Emails are never shown.
- The public page shows how many students registered, and which skills teams need (names only). It shows **no team counts** and no names.
- Nothing about teams can change after the deadline.

### Tested
- 119 database tests.
- 800 people registering plus 60 removals at the same moment: no errors, no deadlocks, no rule ever broken.
- Browser tests of the full flow, including the forced video and consent, plus layout checks at 320, 360, 375, 414, 768, 1024 and 1440 px wide.
- 16 rolled-back checks on the live database.

## Files
| File | What it is |
|---|---|
| `index.html` | the page. A "Register now" bar sticks to the bottom once the hero scrolls away. |
| `assets/brand/` | the official TuteDude logo (from tutedude.com) |
| `config.js` | **settings**: Supabase URL and publishable key, login type, dates, TuteDude Sessions link and video, skills |
| `supabase.sql` | the database: tables plus the functions that enforce every rule. Running it again is safe. |
| `board.js` | everything students click: registration, team picker, team page, session pop-up, notifications |
| `script.js` | countdowns, menu, FAQ |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | notifications + "Add to Home Screen" |
| `vendor/supabase.js` | Supabase's browser library (v2.45.4), shipped with the site so a blocked CDN can't break it |
| `supabase/functions/notify/index.ts` | optional Edge Function for phone notifications |
| `.env`, `vapid-keys.local.json` | secrets: git-ignored, stay on your computer |

## Settings that must match
| What | `config.js` | `supabase.sql` |
|---|---|---|
| Team lock | `teamDeadline` | `bd_deadline()` |
| Problem statement time | `buildDay` | `bd_reveal()` |
| Team size | `maxTeamSize` | `bd_max()` |
| Minimum to complete | `minTeamSize` | `bd_min()` |
| Skills | `domains` | `bd_domains()`, `bd_label()` |
| Reminder times | (none) | pg_cron schedule at the bottom |

After editing `supabase.sql`, run it again in **Supabase → SQL Editor**.

## Sign-in
- **`login: "anonymous"` (current).** No sign-in; just the form. The team is tied to that phone or browser. Organisers still have each student's WhatsApp and email.
  - Turn it on in **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
  - Raise **Authentication → Rate limits → anonymous sign-ins**, because a whole college on one Wi-Fi shares one IP.
- **`login: "google"`.** Students can open their team from any device. This needs a Google OAuth client added under **Authentication → Providers → Google**.

## Phone notifications (optional)
Without this step, notifications show while the site is open. With it, they also reach the phone when the site is closed.
1. **Edge Functions → Deploy a new function → Via editor.** Name it `notify`, paste `supabase/functions/notify/index.ts`, and deploy.
2. In the function's settings, turn **Verify JWT off**.
3. Under **Edge Functions → Secrets**, add these four values. The first three come from `vapid-keys.local.json`:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `NOTIFY_SECRET`
   - `VAPID_SUBJECT` = `mailto:<your email>`
4. In the SQL Editor, run:
   ```sql
   insert into bd_settings (key, value) values
     ('notify_url', 'https://zbcldrkowkpvkxepltrt.supabase.co/functions/v1/notify'),
     ('notify_secret', '<NOTIFY_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```

## Start fresh (deletes every registration)
The live data was cleared on 13 Nov 2026. If you test again before launch, run this in the SQL Editor to wipe it. **It cannot be undone.**
```sql
delete from auth.users where id in (select id from people) or is_anonymous;  -- people, members, teams, notifications follow
delete from teams;                                                            -- anything left over
alter sequence team_no_seq restart with 1;                                    -- next new team is "Team 1"
```

## Publish the problem statement
Run this in the SQL Editor any time before 7 PM on 21 Nov. Students see it on their team page from 7 PM, and a notification goes out at 7 PM.
```sql
insert into bd_settings (key, value) values
  ('problem_statement', 'Write the problem statement here. Line breaks are kept; links become clickable.'),
  ('problem_link', 'https://link-to-the-full-brief (optional, leave empty for none)')
on conflict (key) do update set value = excluded.value;
```
It is never on the public page. Only teams of 2+ people see it, and only members who agreed to TuteDude Sessions.

## After 20 Nov: final teams
In the SQL Editor, run the query below, then click **Export → CSV**:
```sql
select t.name as team, t.size, t.complete, p.name, p.domain, p.phone, p.email, (t.leader_id = p.id) as leader,
       (p.session_ok_at is not null) as agreed_to_session
from teams t join members m on m.team_id = t.id join people p on p.id = m.person_id
order by t.created_at, m.joined_at;
```

## Cost
- **Free plan:** works, with 200 simultaneous live connections. Above that the page refreshes every 15 s instead of instantly.
- **Pro plan:** $25/month and allows 500. It can be switched on for event week only.

## Run locally
```sh
python3 -m http.server 8000   # then open http://localhost:8000
```
Set `supabase: null` in `config.js` to use the offline demo with sample teams.
