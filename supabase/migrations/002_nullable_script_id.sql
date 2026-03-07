-- Allow rooms to be created without a script (deferred selection in waiting room)
alter table rooms alter column script_id drop not null;
