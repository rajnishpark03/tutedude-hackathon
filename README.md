# TuteDude Internal Hackathon — website

Live: https://rajnishpark03.github.io/tutedude-hackathon/  
Repo: https://github.com/rajnishpark03/tutedude-hackathon (GitHub Pages serves the `main` branch root; push to `main` to update the site)

Static landing page for the TuteDude Internal Hackathon (24-hour sprint, teams of 3–5, ₹20,000 prize, launch 4 November 2026).
Styled after the HireDude Script-Writing Hackathon page, using TuteDude's purple/gold brand.

## Files
- `index.html` — all page content (hero, prize, who, how it works, deliverables, community + video, timeline, about, FAQs, registration form, footer)
- `styles.css` — design tokens at the top of the file (`:root`), then component styles
- `script.js` — countdown, community video, mobile nav, FAQ accordion, dynamic team-member rows, form validation, sticky bottom CTA
- `assets/Tutedude_SpeakUp_1080p.mp4` — the community video (Drive fallback link is in `script.js`)

## Rule: TuteDude students only
Every member must be a currently enrolled TuteDude student. If any outsider is found on a team, the whole team is disqualified. This is stated in the hero badge, the "Who should join" callout, the FAQ, the registration consent and the Community Hub banner.

## Community
Grouping happens on SpeakUp (the channel inside the TuteDude account): https://upskill.tutedude.com/course/lecture-growthhacking/community?channel=shared--speak-up. The landing page links there everywhere and offers a copy-paste intro message. The earlier Hackathon Hub prototype (groups, sessions, rooms, leaderboard) is parked in `archive/hub/` with its playbook, in case you want it later.

## (archived) Community Hub data
- On the claude.ai artifact link the hub uses the artifact's shared database, so everyone with the link sees the same teams, sessions and messages.
- As plain static files it falls back to `localStorage` (one browser only). To make the static site multi-user, implement the five-method adapter in `community.js` (`list/get/set/update/delete` + `watch/watchDoc`) against Firebase, Supabase or your own API.

## Run locally
Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Things to update before launch
1. **Ceremony time** — in `script.js`, set `SPRINT_END` once the ceremony end time is known. The countdown switches from "Launch day in" to "Submissions close in".
2. **Form backend** — in `script.js`, replace the `localStorage` block inside the submit handler with a `fetch()` to your endpoint (Google Apps Script, Formspree, your own API). `payload` already holds the team data as JSON.
3. **SpeakUp link** — add the real channel URL wherever SpeakUp is mentioned if you want it clickable.
4. **Logo** — the header uses a CSS wordmark. Swap `.brand-word` in `index.html` for an `<img>` if you have the logo file.
5. **Video** — `VIDEO` in `script.js` points at `assets/Tutedude_SpeakUp_1080p.mp4` with the Drive link as fallback. Replace either if the video changes.
