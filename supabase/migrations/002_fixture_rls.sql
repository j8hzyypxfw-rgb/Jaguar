-- RLS policy for fixture_schedules (was missing from initial schema)
create policy "fixture_schedules_all"
  on fixture_schedules
  for all
  to authenticated
  using (true)
  with check (true);
