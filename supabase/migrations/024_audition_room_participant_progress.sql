alter table public.audition_room_participants
  add column if not exists recording_state text,
  add column if not exists recording_state_take_id uuid references public.audition_takes(id) on delete set null,
  add column if not exists recording_state_updated_at timestamptz;

update public.audition_room_participants
set recording_state = coalesce(recording_state, 'idle')
where recording_state is null;

alter table public.audition_room_participants
  alter column recording_state set default 'idle';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audition_room_participants_recording_state_check'
  ) then
    alter table public.audition_room_participants
      add constraint audition_room_participants_recording_state_check
      check (recording_state in ('idle', 'recording', 'awaiting_uploads', 'complete'));
  end if;
end $$;
