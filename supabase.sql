-- ============================================================
-- TuteDude Buildathon: Team Board database (Supabase)
-- Run once: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again after editing the settings below.
--
-- How teams form (first come, first served):
--   when someone registers, they go into the OLDEST team that has a free spot
--   and nobody with their skill yet. If no team fits, a new team starts with them as leader.
--   A team of 4 (all different skills) is complete; the leader can also complete it at 2+.
--
-- The website can't write to the tables directly (row level security is on).
-- Everything goes through the functions below, which check every rule.
-- ============================================================

-- ---------- Settings: keep in sync with config.js ----------
create or replace function bd_deadline() returns timestamptz language sql immutable as $$ select timestamptz '2026-11-20 23:59:59+05:30' $$;
create or replace function bd_max() returns int language sql immutable as $$ select 4 $$;         -- people per team
create or replace function bd_min() returns int language sql immutable as $$ select 2 $$;         -- min people to mark a team complete
create or replace function bd_domains() returns text[] language sql immutable as $$ select array['design','dev','marketing','video','other'] $$;
create or replace function bd_label(d text) returns text language sql immutable as $$
  select case d when 'design' then 'UI/UX Designer' when 'dev' then 'Developer' when 'marketing' then 'Marketing'
                when 'video' then 'Video Editor' else 'Other skill' end $$;
-- the problem statement appears on team pages at this time (config.js buildDay)
create or replace function bd_reveal() returns timestamptz language sql immutable as $$ select timestamptz '2026-11-21 19:00:00+05:30' $$;

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net not available: phone notifications are off'; end $$;

-- ---------- Tables ----------
create table if not exists people (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  domain text not null,
  skill text not null default '' check (char_length(skill) <= 80),
  link text not null default '' check (char_length(link) <= 200),
  avatar text not null default '' check (char_length(avatar) <= 500),
  phone text not null default '' check (phone = '' or phone ~ '^\+?[0-9]{10,13}$'),  -- WhatsApp, required by save_profile; organisers only
  email text not null default '',
  created_at timestamptz not null default now()
);

create sequence if not exists team_no_seq;
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  leader_id uuid not null references people(id) on delete cascade,
  complete boolean not null default false,  -- true = team is set; nobody new joins
  size int not null default 0,              -- kept up to date by a trigger on members
  skills text[] not null default '{}',      -- skills already in the team (trigger on members)
  created_at timestamptz not null default clock_timestamp()
);
-- session_link / session_link_at: no longer used (kept so old data still loads)
alter table teams add column if not exists session_link text not null default '' check (char_length(session_link) <= 300);
alter table teams add column if not exists session_link_at timestamptz;
alter table teams add column if not exists removals int not null default 0;  -- leader removals used (max 2)
alter table people add column if not exists consent_at timestamptz;          -- when they confirmed they're a TuteDude student
create unique index if not exists teams_name_unique on teams (lower(name));
-- When a student agreed to discuss their product with their team on a TuteDude session.
-- Only then do they see their teammates' WhatsApp numbers (see get_me).
alter table people add column if not exists session_ok_at timestamptz;
-- (session links were dropped: TuteDude rooms are created inside TuteDude, there is no link to paste)
drop index if exists teams_session_unique;
create index if not exists teams_open_idx on teams (created_at) where not complete;
create index if not exists teams_done_idx on teams (created_at desc) where complete;

-- person_id is the primary key, so a person can only ever be in one team
create table if not exists members (
  person_id uuid primary key references people(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp()
);
create index if not exists members_team_idx on members (team_id);
create index if not exists people_phone_idx on people (right(phone, 10));
create index if not exists people_email_idx on people (lower(email));

-- keep teams.size and teams.skills in step with members (fast placement for thousands of teams)
create or replace function bd_team_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid uuid := coalesce(new.team_id, old.team_id);
begin
  update teams t set size = x.n, skills = x.s
  from (select count(*)::int as n, coalesce(array_agg(p.domain), '{}') as s
        from members m join people p on p.id = m.person_id where m.team_id = tid) x
  where t.id = tid;
  return null;
end $$;
drop trigger if exists bd_members_counts on members;
create trigger bd_members_counts after insert or delete on members for each row execute function bd_team_counts();

create table if not exists messages (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists messages_team_idx on messages (team_id, id);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  person_id uuid not null references people(id) on delete cascade,
  title text not null,
  body text not null default '',
  tag text not null default '',
  url text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists notifications_person_idx on notifications (person_id, id);

create table if not exists push_subs (
  endpoint text primary key,
  person_id uuid not null references people(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- notify_url / notify_secret for phone notifications (see README)
create table if not exists bd_settings (key text primary key, value text not null default '');

alter table people enable row level security;
alter table teams enable row level security;
alter table members enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table push_subs enable row level security;
alter table bd_settings enable row level security;

-- ---------- Internal helpers ----------
create or replace function bd_me() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  return auth.uid();
end $$;

create or replace function bd_open() returns void
language plpgsql stable as $$
begin
  if now() > bd_deadline() then raise exception 'Teams are locked now.'; end if;
end $$;

-- WhatsApp numbers are stored as digits with country code: "09876543210", "+91 98765 43210" → "919876543210"
create or replace function bd_phone(p text) returns text
language sql immutable as $$
  select case when d ~ '^[0-9]{10}$' then '91' || d else d end
  from (select ltrim(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '0') as d) x
$$;
create or replace function bd_phone_ok(ph text) returns boolean
language sql immutable as $$
  select ph ~ '^[0-9]{11,13}$' and (ph !~ '^91' or ph ~ '^91[6-9][0-9]{9}$')
$$;

-- team names: no impersonation, no abuse
create or replace function bd_team_name_ok(nm text) returns boolean
language sql immutable as $$
  select nm !~* '(tutedude|official|admin|organi[sz]er|moderator|support)'
     and nm !~* '(fuck|shit|bitch|chutiya|chutia|madarchod|bhenchod|behenchod|bsdk|randi|gandu|lund|lauda|loda|harami)'
$$;

-- the caller's team (used by the read policies below, so it must stay callable)
create or replace function bd_my_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from members where person_id = auth.uid()
$$;

create or replace function bd_notify(p_person uuid, p_title text, p_body text, p_tag text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (person_id, title, body, tag, url) values (p_person, left(p_title, 80), left(p_body, 140), p_tag, '#board');
$$;

create or replace function bd_notify_team(p_team uuid, p_except uuid, p_title text, p_body text, p_tag text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (person_id, title, body, tag, url)
  select m.person_id, left(p_title, 80), left(p_body, 140), p_tag, '#board'
  from members m where m.team_id = p_team and m.person_id is distinct from p_except;
$$;

create or replace function bd_say(p_team uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into messages (team_id, person_id, kind, body) values (p_team, null, 'system', left(p_text, 300));
$$;

create or replace function bd_complete(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update teams set complete = true where id = p_team and not complete;
  if not found then return; end if;
  perform bd_say(p_team, 'Team is complete! 🎉 Next step: meet on your TuteDude session.');
  perform bd_notify_team(p_team, null, 'Your team is complete! 🎉', 'Next step: join your TuteDude session.', 'team-' || p_team);
end $$;

-- put a person into one specific team, if it still has a free spot for their skill; returns null if not
create or replace function bd_join(p_person uuid, p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d text; nm text; tname text; n int;
begin
  perform pg_advisory_xact_lock(7231001);  -- one placement at a time, so two people never take the same spot
  select domain, name into d, nm from people where id = p_person;
  select t.name into tname from teams t
  where t.id = p_team and not t.complete and t.size < bd_max() and not (d = any(t.skills));
  if tname is null then return null; end if;
  insert into members (person_id, team_id) values (p_person, p_team);
  perform bd_say(p_team, nm || ' (' || bd_label(d) || ') joined the team 👋');
  perform bd_notify_team(p_team, p_person, tname || ': new teammate', nm || ' (' || bd_label(d) || ') joined your team. Say hi on WhatsApp!', 'team-' || p_team);
  select size into n from teams where id = p_team;
  if n >= bd_max() then perform bd_complete(p_team); end if;
  return p_team;
end $$;

-- automatic placement: the oldest team with a free spot and nobody of their skill,
-- or a new team with them as leader. p_exclude = a team they must not go back to.
create or replace function bd_assign(p_person uuid, p_exclude uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d text; nm text; tid uuid; tname text;
begin
  perform pg_advisory_xact_lock(7231001);
  select domain, name into d, nm from people where id = p_person;
  select t.id into tid from teams t
  where not t.complete and t.id is distinct from p_exclude
    and t.size < bd_max() and not (d = any(t.skills))
  order by t.created_at, t.id
  limit 1;
  if tid is not null then return bd_join(p_person, tid); end if;

  loop
    tname := 'Team ' || nextval('team_no_seq');
    exit when not exists (select 1 from teams where lower(name) = lower(tname));
  end loop;
  insert into teams (name, leader_id) values (tname, p_person) returning id into tid;
  insert into members (person_id, team_id) values (p_person, tid);
  perform bd_say(tid, nm || ' started this team. New people join as they register. Leader: give the team a name!');
  return tid;
end $$;

-- sends each new notification to the person's phone/laptop through the "notify" Edge Function
create or replace function bd_send_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select value into u from bd_settings where key = 'notify_url';
  select value into s from bd_settings where key = 'notify_secret';
  if coalesce(u, '') = '' then return new; end if;
  if not exists (select 1 from push_subs where person_id = new.person_id) then return new; end if;
  begin
    perform net.http_post(
      url := u,
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', coalesce(s, '')));
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists bd_push on notifications;
create trigger bd_push after insert on notifications for each row execute function bd_send_push();

-- ---------- Live updates (Supabase Realtime "Broadcast", built for many users) ----------
-- new notification → "user:<id>" channel (only that person can listen)
drop trigger if exists bd_message_live on messages;
drop function if exists bd_broadcast_message();

create or replace function bd_broadcast_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(jsonb_build_object('title', new.title, 'body', new.body, 'tag', new.tag), 'note', 'user:' || new.person_id::text, true);
  exception when others then null;
  end;
  return null;
end $$;
drop trigger if exists bd_note_live on notifications;
create trigger bd_note_live after insert on notifications for each row execute function bd_broadcast_note();

-- who may listen to which private channel
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists "buildathon: listen to own channels" on realtime.messages';
    execute $p$create policy "buildathon: listen to own channels" on realtime.messages for select to authenticated
      using (realtime.topic() = 'user:' || auth.uid()::text)$p$;
  else
    raise notice 'realtime schema not found: live updates off (the page still refreshes on its own)';
  end if;
end $$;

-- ---------- Read: public numbers only (no names, no phone numbers, no emails) ----------
-- No team counts either (organisers keep those private): just how many people registered, and which
-- skills forming teams are waiting for, most needed first (skill names only, no numbers).
drop function if exists bd_team_json(teams);
create or replace function get_board() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'stats', json_build_object(
      'people', (select count(*) from people),
      'today', (select count(*) from people where created_at > now() - interval '24 hours'),
      'needs', coalesce((select json_agg(d order by n desc, d) from (
                 select d, count(*) as n from teams t, unnest(bd_domains()) as d
                 where not t.complete and t.size < bd_max() and not (d = any(t.skills)) and now() <= bd_deadline() group by d) x), '[]'::json))
  );
$$;

-- ---------- Read: my profile and my team ----------
create or replace function get_me() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); tid uuid; agreed boolean;
begin
  if uid is null then return json_build_object('me', null); end if;
  select team_id into tid from members where person_id = uid;
  agreed := coalesce((select session_ok_at is not null from people where id = uid), false);
  return json_build_object(
    'me', (select json_build_object('id', id, 'name', name, 'domain', domain, 'skill', skill, 'link', link, 'avatar', avatar, 'phone', phone, 'email', email,
                                    'sessionOk', session_ok_at is not null) from people where id = uid),
    'team', case when tid is null then null else (
      select json_build_object('id', t.id, 'name', t.name, 'leaderId', t.leader_id, 'complete', t.complete,
        -- the problem statement: from bd_reveal(), for teams of bd_min()+ people, to members who agreed to
        -- TuteDude sessions (organisers put the text/link in bd_settings)
        'problem', case when now() >= bd_reveal() and t.size >= bd_min() and agreed then json_build_object(
                     'text', coalesce((select value from bd_settings where key = 'problem_statement'), ''),
                     'link', coalesce((select value from bd_settings where key = 'problem_link'), '')) end,
        'removalsLeft', greatest(0, 2 - t.removals),
        -- teammates' WhatsApp numbers: only for members of this same team, and only after I agreed to
        -- discuss our product on a TuteDude session (the session comes BEFORE WhatsApp)
        'whatsappLocked', not agreed,
        'members', (select json_agg(json_build_object('id', p.id, 'name', p.name, 'domain', p.domain, 'skill', p.skill, 'link', p.link, 'avatar', p.avatar,
                                                      'phone', case when p.id = uid or agreed then p.phone else '' end,
                                                      'joinedAt', (extract(epoch from m.joined_at) * 1000)::bigint) order by m.joined_at)
                      from members m join people p on p.id = m.person_id where m.team_id = t.id))
      from teams t where t.id = tid) end
  );
end $$;

-- ---------- Registration: teams with a free spot for a skill (names only) ----------
create or replace function open_teams(p_domain text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name) order by x.created_at), '[]'::json)
  from (select id, name, created_at from teams
        where not complete and size < bd_max() and not (p_domain = any(skills)) and now() <= bd_deadline()
        order by created_at limit 30) x;
$$;

-- ---------- Register (joins the chosen team, or is placed automatically) / edit profile ----------
-- Returns {"team": "<team name>", "gotChoice": true|false|null}. gotChoice = false means the chosen
-- team filled up a moment earlier, so the person was placed in another team.
drop function if exists save_profile(text, text, text, text, text);
drop function if exists save_profile(text, text, text, text, text, text, uuid);
create or replace function save_profile(p_name text, p_domain text, p_phone text, p_email text,
                                        p_skill text default '', p_link text default '', p_team uuid default null,
                                        p_consent boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); old_domain text; in_team boolean; tid uuid; got boolean; is_new boolean;
        ph text := bd_phone(p_phone); lk text := trim(coalesce(p_link, ''));
        em text := lower(trim(coalesce(p_email, '')));
begin
  perform bd_open();
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 40 then raise exception 'Please write your name.'; end if;
  if not p_domain = any(bd_domains()) then raise exception 'Pick what you do.'; end if;
  if not bd_phone_ok(ph) then raise exception 'Please write your WhatsApp number (10 digits).'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 120 then raise exception 'Please write a valid email address.'; end if;
  if char_length(trim(coalesce(p_skill, ''))) > 80 then raise exception 'Keep the line about you under 80 characters.'; end if;
  if lk <> '' and (lk !~* '^https?://\S+$' or char_length(lk) > 200) then raise exception 'Paste the full link, starting with https://'; end if;
  -- one placement lock for everything that changes teams, always taken first (no deadlocks),
  -- so "check, then insert" is safe when many people submit at the same moment
  perform pg_advisory_xact_lock(7231001);
  is_new := not exists (select 1 from people where id = uid);
  if is_new and not coalesce(p_consent, false) then raise exception 'Please confirm you''re a TuteDude student.'; end if;
  -- one registration per WhatsApp number and per email, so one person can't take two seats
  if exists (select 1 from people where id <> uid and phone <> '' and right(phone, 10) = right(ph, 10)) then
    raise exception 'This WhatsApp number is already registered. Open the site on the phone or browser you registered with, or message the organisers on SpeakUp.';
  end if;
  if exists (select 1 from people where id <> uid and lower(email) = em) then
    raise exception 'This email is already registered. Open the site on the phone or browser you registered with, or message the organisers on SpeakUp.';
  end if;
  select domain into old_domain from people where id = uid;
  in_team := exists (select 1 from members where person_id = uid);
  if in_team and old_domain is distinct from p_domain then
    raise exception 'You can''t change your skill after you are placed in a team.';
  end if;
  insert into people (id, name, domain, skill, link, phone, avatar, email, consent_at)
  select uid, trim(p_name), p_domain, trim(coalesce(p_skill, '')), lk, ph,
         -- only real Google profile photos (anyone can set their own metadata, so no other URLs)
         case when coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '') ~ '^https://lh[0-9]+\.googleusercontent\.com/'
              then left(coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'), 500) else '' end,
         em, now()
  from auth.users u where u.id = uid
  on conflict (id) do update set name = excluded.name, domain = excluded.domain, skill = excluded.skill,
    link = excluded.link, phone = excluded.phone, avatar = excluded.avatar, email = excluded.email;
  if in_team then
    select team_id into tid from members where person_id = uid;
  else
    if p_team is not null then
      tid := bd_join(uid, p_team);
      got := tid is not null;
    end if;
    if tid is null then tid := bd_assign(uid, null); end if;
  end if;
  return json_build_object('team', (select name from teams where id = tid), 'gotChoice', got);
end $$;

-- Lost the browser session (new phone, iPhone home-screen app, cleared data)? Prove it's you with the
-- same WhatsApp number + email, and the registration moves to this device.
create or replace function reclaim_profile(p_phone text, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); old uuid; ph text := bd_phone(p_phone); em text := lower(trim(coalesce(p_email, '')));
begin
  perform pg_advisory_xact_lock(7231001);
  if exists (select 1 from people where id = uid) then raise exception 'You are already registered on this device.'; end if;
  select id into old from people where phone <> '' and right(phone, 10) = right(ph, 10) and lower(email) = em and em <> '';
  if old is null then raise exception 'No registration found with that WhatsApp number and email. Check both, or register as new.'; end if;
  insert into people (id, name, domain, skill, link, phone, avatar, email, created_at, consent_at, session_ok_at)
    select uid, name, domain, skill, link, phone, avatar, email, created_at, consent_at, session_ok_at from people where id = old;
  update members set person_id = uid where person_id = old;
  update teams set leader_id = uid where leader_id = old;
  update messages set person_id = uid where person_id = old;
  update notifications set person_id = uid where person_id = old;
  delete from push_subs where person_id = old;   -- belonged to the old device
  delete from people where id = old;
  return json_build_object('team', (select t.name from members m join teams t on t.id = m.team_id where m.person_id = uid));
end $$;

-- registered but somehow not in a team (e.g. an organiser deleted their team): place them again
create or replace function ensure_team() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); tid uuid;
begin
  perform bd_open();
  perform pg_advisory_xact_lock(7231001);
  if not exists (select 1 from people where id = uid) then raise exception 'Register first.'; end if;
  select team_id into tid from members where person_id = uid;
  if tid is null then tid := bd_assign(uid, null); end if;
  return (select name from teams where id = tid);
end $$;

-- if an organiser deletes a person who leads a team, hand the team to the next member (don't wipe it)
create or replace function bd_before_person_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; nxt uuid;
begin
  for t in select id from teams where leader_id = old.id loop
    select person_id into nxt from members where team_id = t.id and person_id <> old.id order by joined_at limit 1;
    if nxt is null then delete from teams where id = t.id;
    else update teams set leader_id = nxt where id = t.id; end if;
  end loop;
  return old;
end $$;
drop trigger if exists bd_person_delete on people;
create trigger bd_person_delete before delete on people for each row execute function bd_before_person_delete();

-- ---------- Team actions ----------
create or replace function rename_team(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); tid uuid; nm text := trim(coalesce(p_name, ''));
begin
  perform bd_open();
  select id into tid from teams where leader_id = uid;
  if tid is null then raise exception 'Only the team leader can rename the team.'; end if;
  if char_length(nm) not between 2 and 40 then raise exception 'Give your team a name (2 to 40 letters).'; end if;
  if not bd_team_name_ok(nm) then raise exception 'Please pick a different team name.'; end if;
  if exists (select 1 from teams where lower(name) = lower(nm) and id <> tid) then raise exception 'That team name is taken. Try another one.'; end if;
  update teams set name = nm where id = tid;
  perform bd_say(tid, 'The team is now called ' || nm || '.');
end $$;

-- leader says "we're all set" (at least bd_min people)
create or replace function complete_team() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); tid uuid;
begin
  perform bd_open();
  perform pg_advisory_xact_lock(7231001);
  select id into tid from teams where leader_id = uid;
  if tid is null then raise exception 'Only the team leader can do this.'; end if;
  if (select count(*) from members where team_id = tid) < bd_min() then raise exception 'You need at least % people in the team.', bd_min(); end if;
  perform bd_complete(tid);
end $$;

-- Once you join a team you stay in it: there is no "switch team".
drop function if exists switch_team();

-- leader moves an inactive member out; they are placed in another team automatically.
-- Limits stop abuse (e.g. removing newcomers to collect WhatsApp numbers): at most 2 removals per team,
-- and only someone who has been in the team for 6 hours (time to answer on WhatsApp).
create or replace function remove_member(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); tid uuid; pname text; newt uuid; joined timestamptz;
begin
  perform bd_open();
  perform pg_advisory_xact_lock(7231001);  -- same lock as joins, taken first: no deadlocks
  select id into tid from teams where leader_id = uid;
  if tid is null then raise exception 'Only the team leader can remove people.'; end if;
  if p_person = uid then raise exception 'You can''t remove yourself from your team.'; end if;
  select joined_at into joined from members where person_id = p_person and team_id = tid;
  if joined is null then return; end if;
  if (select removals from teams where id = tid) >= 2 then raise exception 'Your team has already used its 2 removals. Message the organisers on SpeakUp if you need help.'; end if;
  if joined > now() - interval '6 hours' then raise exception 'Give new teammates 6 hours to reply on WhatsApp before removing them.'; end if;
  select name into pname from people where id = p_person;
  delete from members where person_id = p_person and team_id = tid;
  update teams set complete = false, removals = removals + 1 where id = tid;
  perform bd_say(tid, pname || ' was moved to another team. The next person with that skill joins here.');
  newt := bd_assign(p_person, tid);
  perform bd_notify(p_person, 'Team update', 'You were moved to ' || (select name from teams where id = newt) || '. Say hi to your new team on WhatsApp!', 'team-' || newt);
end $$;

-- "Yes, I'll discuss our product with my team on a TuteDude session": unlocks teammates' WhatsApp numbers.
drop function if exists set_session_link(text);
drop function if exists bd_session_link_ok(text);
drop function if exists bd_session_link_real(text);
drop function if exists bd_link_key(text);
drop function if exists bd_session_page();
drop function if exists bd_session_deadline();
create or replace function agree_session() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me(); tid uuid; nm text;
begin
  select name into nm from people where id = uid;
  if nm is null then raise exception 'Register first.'; end if;
  update people set session_ok_at = now() where id = uid and session_ok_at is null;
  if not found then return; end if;
  select team_id into tid from members where person_id = uid;
  if tid is not null then perform bd_say(tid, nm || ' agreed to discuss the product on a TuteDude session.'); end if;
end $$;

-- reminder notifications (run on a schedule by pg_cron, see the bottom of this file)
create or replace function bd_remind(p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if p_kind = 'lock-soon' and now() not between bd_deadline() - interval '20 hours' and bd_deadline() then return 0; end if;
  if p_kind = 'reveal-soon' and now() not between bd_deadline() and bd_reveal() then return 0; end if;
  if p_kind = 'reveal-now' and now() not between bd_reveal() and bd_reveal() + interval '1 day' then return 0; end if;
  if p_kind = 'lock-soon' then
    insert into notifications (person_id, title, body, tag, url)
    select m.person_id, '⏳ Teams lock tonight at 11:59 PM',
           case when t.size < bd_min() then 'You are alone in ' || t.name || '. Share the Buildathon link: new people join open teams automatically.'
                else t.name || ' has ' || t.size || '/' || bd_max() || '. The leader can mark it complete before 11:59 PM.' end,
           'remind-' || t.id, '#board'
    from teams t join members m on m.team_id = t.id where not t.complete;
    get diagnostics n = row_count;
  elsif p_kind = 'reveal-soon' then
    insert into notifications (person_id, title, body, tag, url)
    select m.person_id, '🚀 Problem statement in 1 hour',
           case when p.session_ok_at is not null then 'Meet your team on your TuteDude session. The problem statement appears on your team page at 7 PM.'
                else 'Agree to meet on a TuteDude session on the site to unlock your teammates'' WhatsApp and the problem statement.' end,
           'reveal-' || t.id, '#board'
    from teams t join members m on m.team_id = t.id join people p on p.id = m.person_id where t.size >= bd_min();
    get diagnostics n = row_count;
  elsif p_kind = 'reveal-now' then
    insert into notifications (person_id, title, body, tag, url)
    select m.person_id, '📢 The problem statement is out!', 'Open the Buildathon site to read it, then start building with your team.',
           'problem-' || t.id, '#board'
    from teams t join members m on m.team_id = t.id where t.size >= bd_min();
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- Team chat was removed: teammates talk on WhatsApp (get_me shows teammates' numbers to their own team only).
-- The messages table stays as a quiet activity log (who joined, left, renamed…), only readable by organisers.
drop function if exists get_messages(bigint);
drop function if exists send_message(text);
drop function if exists bd_chat_limit();

-- ---------- Phone notifications: save / remove this device ----------
create or replace function save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := bd_me();
begin
  if not exists (select 1 from people where id = uid) then raise exception 'Register first.'; end if;
  if coalesce(p_endpoint, '') !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Invalid push subscription.';
  end if;
  delete from push_subs where endpoint in (select endpoint from push_subs where person_id = uid and endpoint <> p_endpoint
                                           order by created_at desc offset 4);  -- keep the newest 4 others → max 5
  insert into push_subs (endpoint, person_id, p256dh, auth) values (p_endpoint, uid, p_p256dh, p_auth)
  on conflict (endpoint) do update set person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function delete_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and person_id = auth.uid();
$$;

-- ---------- Who can call what ----------
revoke execute on function bd_me(), bd_open(), bd_notify(uuid, text, text, text), bd_notify_team(uuid, uuid, text, text, text),
  bd_say(uuid, text), bd_complete(uuid), bd_assign(uuid, uuid), bd_send_push(), bd_team_counts(),
  bd_broadcast_note(), bd_remind(text), bd_join(uuid, uuid), bd_before_person_delete() from public, anon, authenticated;
grant execute on function bd_my_team() to authenticated;
grant execute on function get_board(), open_teams(text) to anon, authenticated;
grant execute on function get_me(), save_profile(text, text, text, text, text, text, uuid, boolean), rename_team(text), complete_team(),
  remove_member(uuid), agree_session(), save_push(text, text, text), delete_push(text),
  reclaim_profile(text, text), ensure_team() to authenticated;

-- ---------- Reminder schedule (pg_cron runs in UTC; IST = UTC + 5:30) ----------
--   20 Nov 10:00 AM + 8:00 PM IST: "teams lock tonight" (incomplete teams)
--   21 Nov 6:00 PM IST: "problem statement in 1 hour"   ·   21 Nov 7:00 PM IST: "problem statement is out" (teams of 2+)
do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('buildathon-lock-soon-am', '30 4 20 11 *', 'select public.bd_remind(''lock-soon'')');
  perform cron.schedule('buildathon-lock-soon-pm', '30 14 20 11 *', 'select public.bd_remind(''lock-soon'')');
  perform cron.unschedule(jobname) from cron.job where jobname like 'buildathon-session-%';
  perform cron.schedule('buildathon-reveal-soon', '30 12 21 11 *', 'select public.bd_remind(''reveal-soon'')');
  perform cron.schedule('buildathon-reveal-now', '30 13 21 11 *', 'select public.bd_remind(''reveal-now'')');
exception when others then
  raise notice 'pg_cron not available, reminder notifications are off: %', sqlerrm;
end $$;

-- ---------- After 20 Nov: the final teams (run this in the SQL editor, then Export → CSV) ----------
-- select t.name as team, t.size, t.complete, p.name, p.domain, p.email, p.phone, (t.leader_id = p.id) as leader,
--        (p.session_ok_at is not null) as agreed_to_session
-- from teams t join members m on m.team_id = t.id join people p on p.id = m.person_id
-- order by t.created_at, m.joined_at;
